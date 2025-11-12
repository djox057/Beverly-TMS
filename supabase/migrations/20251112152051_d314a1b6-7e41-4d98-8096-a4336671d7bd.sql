-- Add foreign key constraint for changed_by to reference profiles
ALTER TABLE assignment_history
ADD CONSTRAINT fk_assignment_history_changed_by
FOREIGN KEY (changed_by)
REFERENCES auth.users(id)
ON DELETE SET NULL;