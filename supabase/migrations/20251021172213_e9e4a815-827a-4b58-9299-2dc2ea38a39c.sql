-- Allow dispatch users to view trailers on trucks with their assigned drivers
CREATE POLICY "Dispatch can view trailers on their trucks"
ON public.trailers
FOR SELECT
USING (
  id IN (
    SELECT t.trailer_id
    FROM trucks t
    WHERE t.driver1_id IN (
      SELECT d.id
      FROM drivers d
      WHERE d.dispatcher_id = auth.uid()
    )
  )
);