# Delete 10 Users Without Profiles

## Summary

Delete 10 auth.users entries that have no corresponding profile in `public.profiles`. These appear to be orphaned accounts.

## Users to Delete

[matthew@bfprime.net](mailto:matthew@bfprime.net), [eric@bfprime.net](mailto:eric@bfprime.net), [noah@bfprime.net](mailto:noah@bfprime.net), [carter@bfprime.net](mailto:carter@bfprime.net), [victor@bfprime.net](mailto:victor@bfprime.net), [will@bfprime.net](mailto:will@bfprime.net), [carl@bfprime.net](mailto:carl@bfprime.net), [roger@bfprime.net](mailto:roger@bfprime.net), [jonathan@bfprime.net](mailto:jonathan@bfprime.net), [cole@bfprime.net](mailto:cole@bfprime.net)

## Steps

1. **Delete from `user_roles**` — Remove any role entries for these 10 user IDs.
2. **Delete from `auth.users**` — Use the Supabase Admin API (`DELETE /auth/v1/admin/users/{id}`) with the service role key for each user.

All 10 deletions will be executed in sequence via API calls.

## Technical Details

- Uses the same cleanup logic as the existing `delete-user` edge function
- Calls `DELETE` on the Supabase Auth Admin endpoint for each user
- No code changes needed — this is a one-time data cleanup operation

Only delete users from table users nothing else!!!