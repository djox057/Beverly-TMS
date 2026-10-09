export type PretripPhotoRef = { id: string; form_submission_id?: string | null };
export type PretripPhotoSubmissionRef = { id: string; driver_name: string; submitted_at: string };
export type PretripPhotoGroup<T extends PretripPhotoRef> = {
  id: string;
  label: string;
  title: string;
  photos: T[];
};

export function groupPretripPhotosByForm<T extends PretripPhotoRef>(
  photos: readonly T[],
  submissions: readonly PretripPhotoSubmissionRef[],
): PretripPhotoGroup<T>[] {
  if (submissions.length < 2) {
    return [{ id: "all", label: "Pictures", title: "Pictures", photos: [...photos] }];
  }

  const formIds = new Set(submissions.map((submission) => submission.id));
  const groups = submissions
    .map((submission, index) => {
      const formPhotos = photos.filter((photo) => photo.form_submission_id === submission.id);
      return {
        id: submission.id,
        label: `Form ${index + 1}`,
        title: `Form ${index + 1} · ${submission.driver_name || "Unknown driver"} · ${submission.submitted_at}`,
        photos: formPhotos,
      };
    })
    .filter((group) => group.photos.length > 0);

  const otherPhotos = photos.filter((photo) => !photo.form_submission_id || !formIds.has(photo.form_submission_id));
  if (otherPhotos.length) {
    groups.push({ id: "other", label: "Other pictures", title: "Pictures not linked to a form", photos: otherPhotos });
  }

  return groups.length ? groups : [{ id: "all", label: "Pictures", title: "Pictures", photos: [] }];
}
