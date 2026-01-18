-- Relax RLS for single-user mode to allow saving without auth session

-- Drop existing restricted policies if they exist (to avoid conflicts)
DROP POLICY IF EXISTS "Users can view own saves" ON saves;
DROP POLICY IF EXISTS "Users can insert own saves" ON saves;
DROP POLICY IF EXISTS "Users can update own saves" ON saves;
DROP POLICY IF EXISTS "Users can delete own saves" ON saves;

DROP POLICY IF EXISTS "Users can view own tags" ON tags;
DROP POLICY IF EXISTS "Users can insert own tags" ON tags;
DROP POLICY IF EXISTS "Users can update own tags" ON tags;
DROP POLICY IF EXISTS "Users can delete own tags" ON tags;

DROP POLICY IF EXISTS "Users can view own folders" ON folders;
DROP POLICY IF EXISTS "Users can insert own folders" ON folders;
DROP POLICY IF EXISTS "Users can update own folders" ON folders;
DROP POLICY IF EXISTS "Users can delete own folders" ON folders;

DROP POLICY IF EXISTS "Users can view own preferences" ON user_preferences;
DROP POLICY IF EXISTS "Users can insert own preferences" ON user_preferences;
DROP POLICY IF EXISTS "Users can update own preferences" ON user_preferences;

-- Create wide-open policies for the 'anon' role
CREATE POLICY "Allow all for anon" ON saves FOR ALL USING (true);
CREATE POLICY "Allow all for anon" ON tags FOR ALL USING (true);
CREATE POLICY "Allow all for anon" ON folders FOR ALL USING (true);
CREATE POLICY "Allow all for anon" ON save_tags FOR ALL USING (true);
CREATE POLICY "Allow all for anon" ON user_preferences FOR ALL USING (true);
