import { PrismaClient } from "@prisma/client";
import { faker } from "@faker-js/faker";
import { config } from "../src/lib/config";

const prisma = new PrismaClient();

const CUISINES = [
  "Pizza",
  "Jollof & Grill",
  "Burgers & Wings",
  "Sushi & Asian",
  "Shawarma & Wraps",
  "Tacos & Mexican",
  "Bakery & Desserts",
  "African Delights",
];

const CITIES = ["Lagos", "Abuja", "Ibadan", "Port Harcourt", "Enugu"];
const CATEGORIES = ["mains", "sides", "drinks", "desserts", "combos"];

async function main() {
  console.log("🌱 Starting seed script...");
  faker.seed(20260917);

  // Support --fresh flag to reset database
  if (process.argv.includes("--fresh")) {
    console.log("🧹 Resetting database (--fresh flag detected)...");
    await prisma.orderItem.deleteMany();
    await prisma.order.deleteMany();
    await prisma.menuItem.deleteMany();
    await prisma.customer.deleteMany();
    await prisma.restaurant.deleteMany();
    console.log("✅ Truncated existing tables.");
  }

  // 1. Seed Restaurants
  console.log(`📌 Seeding restaurants (Target: ${config.seed.restaurants})...`);
  const restaurantIds: string[] = [];

  for (let i = 0; i < config.seed.restaurants; i++) {
    // Fixed seed per iteration for deterministic outputs
    faker.seed(20260917 + i);
    const rawName = `${faker.company.name()} ${faker.helpers.arrayElement(["Bistro", "Kitchen", "Eatery", "Grill", "Diner", "Spot"])}`;
    const name = rawName.substring(0, 110);
    const slug = `restaurant-${i + 1}-${faker.helpers.slugify(name).toLowerCase()}`.substring(0, 135);
    const cuisine = faker.helpers.arrayElement(CUISINES);
    const address = faker.location.streetAddress();
    const city = faker.helpers.arrayElement(CITIES);
    const rating = parseFloat(faker.number.float({ min: 3.0, max: 5.0, fractionDigits: 1 }).toFixed(1));
    const deliveryFeeKobo = BigInt(faker.number.int({ min: 300, max: 2500 }) * 100);
    const isOpen = faker.datatype.boolean({ probability: 0.85 });

    const restaurant = await prisma.restaurant.upsert({
      where: { slug },
      update: {}, // Rerun does not modify existing data
      create: {
        name,
        slug,
        cuisine,
        address,
        city,
        rating,
        deliveryFeeKobo,
        isOpen,
        createdAt: faker.date.recent({ days: 90 }),
      },
    });

    restaurantIds.push(restaurant.id);
  }
  console.log(`✅ Restaurants count: ${await prisma.restaurant.count()}.`);

  // 2. Seed Menu Items
  console.log(`📌 Seeding menu items (${config.seed.menuItemsPerRestaurant} per restaurant)...`);
  for (let i = 0; i < restaurantIds.length; i++) {
    const restaurantId = restaurantIds[i];
    for (let j = 0; j < config.seed.menuItemsPerRestaurant; j++) {
      faker.seed(20260917 + i * 100 + j);
      const category = faker.helpers.arrayElement(CATEGORIES);
      const baseName = `${faker.commerce.productAdjective()} ${faker.commerce.productName()}`.substring(0, 100);
      const name = `${baseName} #${j + 1}`;
      const description = faker.commerce.productDescription();
      const priceKobo = BigInt(faker.number.int({ min: 1000, max: 18000 }) * 100);
      const isAvailable = faker.datatype.boolean({ probability: 0.9 });

      const existing = await prisma.menuItem.findFirst({
        where: { restaurantId, name },
      });

      if (!existing) {
        await prisma.menuItem.create({
          data: {
            restaurantId,
            name,
            description,
            category,
            priceKobo,
            isAvailable,
            createdAt: faker.date.recent({ days: 60 }),
          },
        });
      }
    }
  }
  console.log(`✅ Menu items count: ${await prisma.menuItem.count()}.`);

  // 3. Seed Customers
  console.log(`📌 Seeding customers (Target: ${config.seed.customers})...`);
  const customerIds: string[] = [];

  for (let k = 0; k < config.seed.customers; k++) {
    faker.seed(20260917 + k * 1000);
    const firstName = faker.person.firstName();
    const lastName = faker.person.lastName();
    const fullName = `${firstName} ${lastName}`.substring(0, 115);
    const email = `customer${k + 1}@example.com`;
    const phone = faker.phone.number().substring(0, 19);
    const city = faker.helpers.arrayElement(CITIES);

    const customer = await prisma.customer.upsert({
      where: { email },
      update: {},
      create: {
        fullName,
        email,
        phone,
        city,
        createdAt: faker.date.recent({ days: 90 }),
      },
    });

    customerIds.push(customer.id);
  }
  console.log(`✅ Customers count: ${await prisma.customer.count()}.`);

  // 4. Seed Orders & Order Items
  const existingOrdersCount = await prisma.order.count();
  if (existingOrdersCount >= config.seed.orders && !process.argv.includes("--fresh")) {
    console.log(`ℹ️ Orders already seeded (${existingOrdersCount} present). Skipping orders creation for idempotency.`);
  } else {
    console.log(`📌 Seeding orders (Target: ${config.seed.orders})...`);
    for (let m = 0; m < config.seed.orders; m++) {
      faker.seed(20260917 + m * 5000);
      const customerId = faker.helpers.arrayElement(customerIds);
      const restaurantId = faker.helpers.arrayElement(restaurantIds);

      const restaurant = await prisma.restaurant.findUnique({
        where: { id: restaurantId },
        select: { deliveryFeeKobo: true },
      });

      const menuItems = await prisma.menuItem.findMany({
        where: { restaurantId, isAvailable: true },
        take: 10,
      });

      if (!restaurant || menuItems.length === 0) continue;

      const itemCount = faker.number.int({ min: 1, max: 4 });
      const selectedMenuItems = faker.helpers.arrayElements(menuItems, Math.min(itemCount, menuItems.length));

      let subtotalKobo = BigInt(0);
      const orderItemsData = [];

      for (const item of selectedMenuItems) {
        const quantity = faker.number.int({ min: 1, max: 3 });
        const unitPriceKobo = item.priceKobo;
        const lineTotal = unitPriceKobo * BigInt(quantity);
        subtotalKobo += lineTotal;

        orderItemsData.push({
          menuItemId: item.id,
          nameAtOrder: item.name,
          unitPriceKobo,
          quantity,
        });
      }

      const deliveryFeeKobo = restaurant.deliveryFeeKobo;
      const totalKobo = subtotalKobo + deliveryFeeKobo;
      const status = faker.helpers.arrayElement(["pending", "confirmed", "delivered", "cancelled"]);
      const deliveryAddress = faker.location.streetAddress();
      const createdAt = faker.date.recent({ days: 90 });

      await prisma.order.create({
        data: {
          customerId,
          restaurantId,
          status,
          subtotalKobo,
          deliveryFeeKobo,
          totalKobo,
          deliveryAddress,
          createdAt,
          items: {
            create: orderItemsData,
          },
        },
      });
    }
    console.log(`✅ Orders count: ${await prisma.order.count()}.`);
  }

  // Final Summary
  const summary = {
    restaurants: await prisma.restaurant.count(),
    menuItems: await prisma.menuItem.count(),
    customers: await prisma.customer.count(),
    orders: await prisma.order.count(),
    orderItems: await prisma.orderItem.count(),
  };

  console.log("\n📊 Seed Data Summary:");
  console.table(summary);
  console.log("✨ Seeding completed successfully!");
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
