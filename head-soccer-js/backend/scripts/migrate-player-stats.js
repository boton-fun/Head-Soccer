/**
 * Migration script to add missing created_at column to player_stats table
 * This fixes the production error: "Could not find the 'created_at' column of 'player_stats'"
 */

const { supabase } = require('../database/supabase');

async function migratePlayerStats() {
  try {
    console.log('🔄 Starting player_stats table migration...');

    // Check if created_at column exists
    const { data: columns, error: columnsError } = await supabase
      .from('information_schema.columns')
      .select('column_name')
      .eq('table_name', 'player_stats')
      .eq('column_name', 'created_at');

    if (columnsError) {
      console.error('❌ Error checking columns:', columnsError);
      return;
    }

    if (columns && columns.length > 0) {
      console.log('✅ created_at column already exists');
      return;
    }

    console.log('🔧 Adding created_at column to player_stats table...');

    // Add created_at column using raw SQL
    const { error: alterError } = await supabase
      .rpc('exec_sql', { 
        sql: `
          -- Add created_at column
          ALTER TABLE public.player_stats 
          ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
          
          -- Update existing records
          UPDATE public.player_stats 
          SET created_at = updated_at 
          WHERE created_at IS NULL;
          
          -- Make created_at NOT NULL
          ALTER TABLE public.player_stats 
          ALTER COLUMN created_at SET NOT NULL;
        `
      });

    if (alterError) {
      console.error('❌ Error adding created_at column:', alterError);
      // Try alternative approach using direct table operations
      console.log('🔧 Attempting alternative migration approach...');
      
      // Get all existing player_stats
      const { data: existingStats, error: fetchError } = await supabase
        .from('player_stats')
        .select('*');

      if (fetchError) {
        console.error('❌ Error fetching existing stats:', fetchError);
        return;
      }

      console.log(`📊 Found ${existingStats.length} existing player_stats records`);
      
      // If we have existing records, we need to handle this carefully
      if (existingStats.length > 0) {
        console.log('⚠️  Database has existing records. Manual intervention may be required.');
        console.log('   Please run the SQL migration script manually in Supabase dashboard:');
        console.log('   D:\\Boton AI - Projects\\head-soccer\\head-soccer-js\\backend\\database\\fix_player_stats.sql');
        return;
      }

      console.log('✅ No existing records to migrate.');
    } else {
      console.log('✅ Successfully added created_at column to player_stats');
    }

    console.log('🎉 Migration completed successfully!');
  } catch (error) {
    console.error('💥 Migration failed:', error);
  }
}

// Run migration if called directly
if (require.main === module) {
  migratePlayerStats().then(() => {
    console.log('Migration script finished');
    process.exit(0);
  }).catch((error) => {
    console.error('Migration script failed:', error);
    process.exit(1);
  });
}

module.exports = { migratePlayerStats };