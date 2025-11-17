-- Add SELECT policy for chicago_management on user_roles table
CREATE POLICY "Chicago Management can view user roles"
ON user_roles
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'chicago_management'));