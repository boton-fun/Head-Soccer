/**
 * Database Connection Test
 */

require('dotenv').config();
const { supabase } = require('../database/supabase');

async function testConnection() {
  try {
    console.log('🔍 Testing database connection...');
    
    // Test basic connection
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .limit(1);

    if (error) {
      console.error('❌ Database connection error:', error);
      return;
    }

    console.log('✅ Database connection successful');
    console.log('Current users count:', data);

    // Test inserting a single user
    console.log('\n🧪 Testing user insertion...');
    const testUser = {
      username: 'testuser123',
      display_name: 'Test User',
      password_hash: '$2b$10$test.hash.only',
      character_id: 'character1',
      elo_rating: 1200
    };

    const { data: insertData, error: insertError } = await supabase
      .from('users')
      .insert(testUser)
      .select();

    if (insertError) {
      console.error('❌ Insert error:', insertError.message);
      console.error('Full error:', insertError);
      return;
    }

    console.log('✅ User inserted successfully:', insertData);

    // Clean up
    if (insertData && insertData[0]) {
      await supabase
        .from('users')
        .delete()
        .eq('id', insertData[0].id);
      console.log('✅ Test user cleaned up');
    }

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Stack:', error.stack);
  }
}

testConnection();