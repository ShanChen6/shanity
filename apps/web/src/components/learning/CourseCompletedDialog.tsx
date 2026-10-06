"use client";
import Link from "next/link";
import { PartyPopper } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";

export function CourseCompletedDialog({
  courseTitle,
  onClose,
  onContinue,
}: {
  courseTitle: string;
  onClose: () => void;
  // Present when optional lessons still follow the current one.
  onContinue?: () => void;
}) {
  return (
    <Dialog
      title="Chúc mừng bạn đã hoàn thành khóa học!"
      description={`Bạn đã hoàn thành 100% bài học bắt buộc của “${courseTitle}”.`}
      onClose={onClose}
    >
      <div className="flex flex-col items-center gap-5 text-center">
        <span className="flex size-16 items-center justify-center rounded-full bg-success-background text-success">
          <PartyPopper aria-hidden size={32} />
        </span>
        <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={onClose}>
            Ở lại bài học
          </Button>
          {onContinue ? (
            <Button variant="outline" onClick={onContinue}>
              Bài tiếp theo
            </Button>
          ) : null}
          <Link
            href="/my-learning"
            className="inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary-hover"
          >
            Về Góc học tập
          </Link>
        </div>
      </div>
    </Dialog>
  );
}
