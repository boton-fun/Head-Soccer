/**
 * Simple schema update script
 * Adds password_hash column to users table
 */

const { supabase } = require('../database/supabase');

async function addPasswordColumn() {
  try {
    console.log('🔄 Adding password_hash column to users table...');
    
    // Execute the ALTER TABLE command
    const { data, error } = await supabase.rpc('exec_sql', {
      sql: `ALTER TABLE public.users ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);`
    });
    
    if (error) {
      console.error('❌ Failed to add column:', error);
      
      // Try alternative approach - direct query
      console.log('🔄 Trying alternative approach...');
      const { error: altError } = await supabase
        .from('users')
        .select('password_hash')
        .limit(1);
      
      if (altError && altError.message.includes('column "password_hash" does not exist')) {
        console.log('Column definitely needs to be added manually via Supabase dashboard');
        return false;
      }
      
      return false;
    }
    
    console.log('✅ Successfully added password_hash column!');
    return true;
    
  } catch (error) {
    console.error('❌ Script error:', error.message);
    return false;
  }
}

// Run the update
addPasswordColumn().then(success => {
  if (!success) {
    console.log('\n📝 Manual Steps Required:');
    console.log('1. Go to https://supabase.com/dashboard');
    console.log('2. Select your Head Soccer project');
    console.log('3. Go to SQL Editor');
    console.log('4. Run this command:');
    console.log('   ALTER TABLE public.users ADD COLUMN password_hash VARCHAR(255) NOT NULL DEFAULT \'\';');
  }
  process.exit(success ? 0 : 1);
});

module.exports = { addPasswordColumn };