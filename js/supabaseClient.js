import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL  = 'https://fiekccauqjrfzlcyoakm.supabase.co';
const SUPABASE_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZpZWtjY2F1cWpyZnpsY3lvYWttIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcyMjUxNjUsImV4cCI6MjEwMjgwMTE2NX0.x638w8cG06rsUiRrpmLBQ5Mn8ueEQ9dpS9nlcI6F6gw';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    persistSession:    true,
    autoRefreshToken:  true,
    detectSessionInUrl: true,
  },
});
