import { createClient } from '@supabase/supabase-js'
const url = 'https://dtpsaljbwczekcteiyjn.supabase.co'
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR0cHNhbGpid2N6ZWtjdGVpeWpuIiwicm9sZSI6ImFub24iLCJpYXQiOjE2NzIzMTU1MjIsImV4cCI6MTk4Nzg5MTUyMn0.tOcZyb2X-57_ZNyu3GbASG3-FPyHY8lnALsBVaqaPy0'
const supabase = createClient(url, key)

export default supabase
