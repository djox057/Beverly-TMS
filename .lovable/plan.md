

## Add "Drives Legally" Checkbox to Drivers Page

### What
Add a "Drives Legally" checkbox next to the existing "Recovery Driver" checkbox in both the **Add Driver** and **Edit Driver** forms. Wire it to the existing `do_not_touch_hos` column on the `drivers` table.

### Changes (single file: `src/pages/Drivers.tsx`)

1. **FormData initialization** (lines ~194, ~393, ~1332): Add `do_not_touch_hos: false` to default state, and `do_not_touch_hos: driver.do_not_touch_hos || false` when loading existing driver.

2. **Insert/Update queries** (lines ~497, ~761): Include `do_not_touch_hos: formData.do_not_touch_hos || false` in the Supabase upsert/update payload.

3. **Add Driver form** (after line ~1987): Add a new checkbox div after "Recovery Driver":
   ```tsx
   <div className="flex items-center space-x-2">
     <Checkbox id="do_not_touch_hos" checked={formData.do_not_touch_hos}
       onCheckedChange={(checked) => setFormData({...formData, do_not_touch_hos: checked === true})} />
     <Label htmlFor="do_not_touch_hos" className="cursor-pointer">Drives Legally</Label>
   </div>
   ```

4. **Edit Driver form** (after line ~3016): Same checkbox with `id="edit_do_not_touch_hos"`.

No database changes needed — the column already exists.

