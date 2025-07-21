/**
 * Database Seeding Script Runner
 * Run: node scripts/seed.js
 */

require('dotenv').config();
const DatabaseSeeder = require('../database/seed-data');

async function main() {
  console.log('🌱 Head Soccer Database Seeding\n');
  
  const seeder = new DatabaseSeeder();
  
  try {
    await seeder.seedDatabase();
    console.log('\n🎉 All done! Database populated with test data.');
  } catch (error) {
    console.error('\n❌ Seeding failed:', error.message);
    process.exit(1);
  }
}

main();