import { describe, expect, it } from "vitest";
import { groupPretripPhotosByForm } from "./pretripPhotoGroups";

const submissions = [
  { id: "form-new", driver_name: "Alex Driver", submitted_at: "2026-10-09T09:30:00" },
  { id: "form-old", driver_name: "Sam Driver", submitted_at: "2026-10-08T07:15:00" },
];

describe("groupPretripPhotosByForm", () => {
  it("keeps photos from each weekly form in separate groups", () => {
    const groups = groupPretripPhotosByForm([
      { id: "photo-1", form_submission_id: "form-new" },
      { id: "photo-2", form_submission_id: "form-new" },
      { id: "photo-3", form_submission_id: "form-old" },
    ], submissions);
    expect(groups.map((group) => [group.id, group.photos.map((photo) => photo.id)])).toEqual([
      ["form-new", ["photo-1", "photo-2"]],
      ["form-old", ["photo-3"]],
    ]);
  });

  it("keeps unlinked manual uploads separate when multiple forms exist", () => {
    const groups = groupPretripPhotosByForm([
      { id: "form-photo", form_submission_id: "form-new" },
      { id: "manual-photo", form_submission_id: null },
    ], submissions);
    expect(groups.map((group) => group.label)).toEqual(["Form 1", "Other pictures"]);
    expect(groups[1].photos.map((photo) => photo.id)).toEqual(["manual-photo"]);
  });

  it("preserves the existing single gallery when there is at most one form", () => {
    const photos = [{ id: "photo-1", form_submission_id: "form-new" }];
    expect(groupPretripPhotosByForm(photos, submissions.slice(0, 1))).toEqual([
      { id: "all", label: "Pictures", title: "Pictures", photos },
    ]);
  });
});
