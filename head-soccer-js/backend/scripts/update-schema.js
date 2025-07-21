/**
 * Script to update Supabase schema with password_hash column
 * Run this once to add the required column to the users table
 */

const { supabase } = require('../database/supabase');

async function updateSchema() {
  try {
    console.log('🔄 Updating database schema...');
    
    // Add password_hash column to users table
    const { data, error } = await supabase.rpc('exec_sql', {
      sql: `ALTER TABLE public.users ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255) NOT NULL DEFAULT '';`
    });
    
    if (error) {
      console.error('❌ Schema update failed:', error);
      return false;
    }
    
    console.log('✅ Schema updated successfully!');
    console.log('✅ Added password_hash column to users table');
    
    // Verify the column was added
    const { data: tableInfo } = await supabase
      .from('information_schema.columns')
      .select('column_name, data_type, is_nullable')
      .eq('table_name', 'users')
      .eq('table_schema', 'public');
    
    console.log('\n📋 Current users table schema:');
    tableInfo?.forEach(col => {
      console.log(`  - ${col.column_name}: ${col.data_type} (nullable: ${col.is_nullable})`);
    });
    
    return true;
  } catch (error) {
    console.error('❌ Error updating schema:', error.message);
    return false;
  }
}

// Run the schema update
if (require.main === module) {
  updateSchema().then(success => {
    process.exit(success ? 0 : 1);
  });
}

module.exports = { updateSchema };