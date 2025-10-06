// Script to upload the load confirmation template to Supabase storage
// Run this once to set up the template

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const supabaseUrl = 'https://wjkbtagwgjniilmgwutb.supabase.co';
// Use service role key for private bucket access
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!supabaseServiceKey) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY environment variable is required');
  console.log('💡 Get it from: https://supabase.com/dashboard/project/wjkbtagwgjniilmgwutb/settings/api');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function uploadTemplate() {
  try {
    // Read the template file
    const templatePath = 'src/assets/load-confirmation-template.pdf';
    const fileBuffer = readFileSync(templatePath);

    console.log('📤 Uploading template to Supabase storage...');

    // Upload to storage
    const { data, error } = await supabase.storage
      .from('order-files')
      .upload('load-confirmation-template.pdf', fileBuffer, {
        contentType: 'application/pdf',
        upsert: true
      });

    if (error) {
      console.error('❌ Error uploading template:', error);
      process.exit(1);
    }

    console.log('✅ Template uploaded successfully!');
    console.log('📁 File path:', data.path);
    console.log('');
    console.log('🔒 The template is stored securely in your order-files bucket');
    console.log('📄 The edge function will load it using the service role key');
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

uploadTemplate();
