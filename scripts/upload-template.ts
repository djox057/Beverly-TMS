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
    // Upload 1P1D template
    const template1Path = 'src/assets/load-confirmation-template.pdf';
    const fileBuffer1 = readFileSync(template1Path);

    console.log('📤 Uploading 1P1D template to Supabase storage...');

    const { data: data1, error: error1 } = await supabase.storage
      .from('order-files')
      .upload('load-confirmation-template.pdf', fileBuffer1, {
        contentType: 'application/pdf',
        upsert: true
      });

    if (error1) {
      console.error('❌ Error uploading 1P1D template:', error1);
      process.exit(1);
    }

    console.log('✅ 1P1D Template uploaded successfully!');
    console.log('📁 File path:', data1.path);

    // Upload 2P1D template
    const template2Path = 'src/assets/load-confirmation-template-2p1d.pdf';
    const fileBuffer2 = readFileSync(template2Path);

    console.log('📤 Uploading 2P1D template to Supabase storage...');

    const { data: data2, error: error2 } = await supabase.storage
      .from('order-files')
      .upload('load-confirmation-template-2p1d.pdf', fileBuffer2, {
        contentType: 'application/pdf',
        upsert: true
      });

    if (error2) {
      console.error('❌ Error uploading 2P1D template:', error2);
      process.exit(1);
    }

    console.log('✅ 2P1D Template uploaded successfully!');
    console.log('📁 File path:', data2.path);
    console.log('');
    console.log('🔒 Both templates are stored securely in your order-files bucket');
    console.log('📄 The edge function will load them using the service role key');
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

uploadTemplate();
