// Script to upload the load confirmation template to Supabase storage
// Run this once to set up the template

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const supabaseUrl = 'https://wjkbtagwgjniilmgwutb.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indqa2J0YWd3Z2puaWlsbWd3dXRiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg2MzUyMTYsImV4cCI6MjA3NDIxMTIxNn0.Nr_W4aVefWnzDUTRdsSVlCk-Jl_pWMTshVinZoVPZqM';

const supabase = createClient(supabaseUrl, supabaseKey);

async function uploadTemplate() {
  try {
    // Read the template file
    const templatePath = 'src/assets/load-confirmation-template.pdf';
    const fileBuffer = readFileSync(templatePath);

    // Upload to storage
    const { data, error } = await supabase.storage
      .from('order-files')
      .upload('load-confirmation-template.pdf', fileBuffer, {
        contentType: 'application/pdf',
        upsert: true
      });

    if (error) {
      console.error('Error uploading template:', error);
      return;
    }

    console.log('Template uploaded successfully:', data);
    
    // Make the file public by updating bucket policies
    console.log('Note: You may need to make this file publicly accessible in your storage bucket settings.');
  } catch (error) {
    console.error('Error:', error);
  }
}

uploadTemplate();
