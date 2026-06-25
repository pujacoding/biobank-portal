import { createClient } from 'https://esm.sh/@supabase/supabase-js';

const supabaseUrl = 'https://nxwardorpuhnungnqohx.supabase.co';

const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im54d2FyZG9ycHVobnVuZ25xb2h4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEyNjM2MTcsImV4cCI6MjA5NjgzOTYxN30.aTB9duVhKnfstnY4D0pnUFzucoER-yRbJ5Brn7xxxxx';

export const supabase = createClient(
    supabaseUrl,
    supabaseAnonKey
);
