"use client";

import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Radio } from "@/components/ui/radio";
import { Select } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { LoadingState } from "@/components/shared/loading-state";
import { BrandLogo } from "@/components/brand/brand-logo";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { useTheme } from "@/providers/theme-provider";

const palettes = [
  "slate",
  "gray",
  "zinc",
  "blue",
  "indigo",
  "violet",
  "green",
  "emerald",
  "amber",
  "yellow",
  "orange",
  "red",
  "rose",
];
const shades = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const id = title.toLowerCase().replaceAll(" ", "-");
  return (
    <section
      aria-labelledby={id}
      className="space-y-5 border-b border-border py-8"
    >
      <h2 id={id} className="font-heading text-h2 font-semibold">
        {title}
      </h2>
      {children}
    </section>
  );
}

export function ThemeShowcase() {
  const { resolvedTheme } = useTheme();
  const [selectedRadio, setSelectedRadio] = useState("lesson");

  return (
    <main className="page">
      <header className="border-b border-border bg-surface">
        <div className="container flex flex-wrap items-center justify-between gap-4 py-5">
          <div>
            <div className="mb-3 flex flex-wrap items-center gap-6">
              <BrandLogo width={140} />
              <BrandLogo variant="icon" width={40} />
              <BrandLogo
                variant="monochrome"
                width={140}
                className="text-primary"
              />
            </div>
            <p className="text-caption font-semibold uppercase text-primary">
              Development showcase
            </p>
            <h1 className="mt-1 font-heading text-h1 font-semibold">
              Theme foundation
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <ThemeToggle />
            <span className="text-caption text-muted" aria-live="polite">
              {resolvedTheme}
            </span>
          </div>
        </div>
      </header>

      <div className="container">
        <Section title="Color palettes">
          <div className="space-y-4">
            {palettes.map((palette) => (
              <div
                key={palette}
                className="grid grid-cols-[5rem_minmax(0,1fr)] items-center gap-3"
              >
                <h3 className="text-body-sm font-semibold capitalize">
                  {palette}
                </h3>
                <div className="grid grid-cols-11 gap-1">
                  {shades.map((shade) => (
                    <span
                      key={shade}
                      title={`${palette}-${shade}`}
                      aria-label={`${palette} ${shade}`}
                      className="h-7 rounded-sm border border-border/40"
                      style={{
                        backgroundColor: `var(--color-${palette}-${shade})`,
                      }}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Semantic surfaces and text">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["Background", "bg-background"],
              ["Surface", "bg-surface"],
              ["Secondary", "bg-surface-secondary"],
              ["Elevated", "bg-surface-elevated shadow-md"],
            ].map(([label, className]) => (
              <div
                key={label}
                className={`rounded-md border border-border p-4 ${className}`}
              >
                <p className="font-semibold">{label}</p>
                <p className="mt-1 text-body-sm text-foreground-secondary">
                  Secondary text sample
                </p>
                <p className="mt-1 text-caption text-muted">Muted caption</p>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-4 pt-2">
            <span className="text-link">Text link</span>
            <span className="rounded-sm bg-accent px-2 py-1 text-accent-foreground">
              Accent
            </span>
            <code className="text-code font-mono">const progress = 0.72;</code>
          </div>
        </Section>

        <Section title="Typography">
          <div className="space-y-4">
            <p className="font-heading text-display font-semibold">Display</p>
            <p className="font-heading text-h1 font-semibold">Heading one</p>
            <p className="font-heading text-h2 font-semibold">Heading two</p>
            <p className="font-heading text-h3 font-semibold">Heading three</p>
            <p className="font-heading text-h4 font-semibold">Heading four</p>
            <p className="text-body-lg">
              Body large for introductions and lead copy.
            </p>
            <p className="text-body">
              Body text for the main reading experience across lessons and
              account pages.
            </p>
            <p className="text-body-sm">
              Small body text for supporting details.
            </p>
            <p className="text-caption text-muted">Caption for metadata.</p>
            <code className="block text-code font-mono">
              export const theme = &quot;semantic&quot;;
            </code>
          </div>
        </Section>

        <Section title="Buttons">
          <div className="flex flex-wrap items-center gap-3">
            <Button>Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="danger">Danger</Button>
            <Button variant="link">Link</Button>
            <Button size="sm">Small</Button>
            <Button size="lg">Large</Button>
            <Button size="icon" aria-label="Action">
              +
            </Button>
            <Button disabled>Disabled</Button>
          </div>
        </Section>

        <Section title="Form controls">
          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="theme-input">Input</Label>
                <Input id="theme-input" placeholder="Email address" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="theme-input-error">Error state</Label>
                <Input
                  id="theme-input-error"
                  aria-invalid="true"
                  defaultValue="not-an-email"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="theme-input-disabled">Disabled</Label>
                <Input
                  id="theme-input-disabled"
                  disabled
                  value="Unavailable"
                  readOnly
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="theme-textarea">Textarea</Label>
                <Textarea id="theme-textarea" placeholder="Add a note" />
              </div>
            </div>
            <div className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="theme-select">Select</Label>
                <Select id="theme-select" defaultValue="course">
                  <option value="course">Course</option>
                  <option value="lesson">Lesson</option>
                  <option value="quiz">Quiz</option>
                </Select>
              </div>
              <label className="flex items-center gap-3 text-body-sm">
                <Checkbox defaultChecked /> Remember this setting
              </label>
              <fieldset className="flex flex-wrap gap-5">
                <legend className="mb-2 text-body-sm font-semibold">
                  Learning view
                </legend>
                {[
                  ["lesson", "Lesson"],
                  ["quiz", "Quiz"],
                ].map(([value, label]) => (
                  <label
                    key={value}
                    className="flex items-center gap-2 text-body-sm"
                  >
                    <Radio
                      name="learning-view"
                      value={value}
                      checked={selectedRadio === value}
                      onChange={() => setSelectedRadio(value)}
                    />
                    {label}
                  </label>
                ))}
              </fieldset>
              <label className="flex items-center gap-3 text-body-sm">
                <Switch defaultChecked /> Email notifications
              </label>
            </div>
          </div>
        </Section>

        <Section title="Badges and alerts">
          <div className="flex flex-wrap gap-2">
            <Badge>Draft</Badge>
            <Badge tone="secondary">Secondary</Badge>
            <Badge tone="outline">Outline</Badge>
            <Badge tone="primary">In progress</Badge>
            <Badge tone="success">Completed</Badge>
            <Badge tone="warning">Needs review</Badge>
            <Badge tone="danger">Overdue</Badge>
            <Badge tone="info">New</Badge>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <Alert tone="info" title="Information">
              Your lesson progress is saved automatically.
            </Alert>
            <Alert tone="success" title="Correct answer">
              This answer matches the expected result.
            </Alert>
            <Alert tone="warning" title="Payment pending">
              Access will begin when the payment is confirmed.
            </Alert>
            <Alert tone="error" title="Check your response">
              One or more required fields need attention.
            </Alert>
            <Alert tone="info">
              <div>
                <AlertTitle>Composable alert</AlertTitle>
                <AlertDescription>
                  Title and description can be composed for richer messages.
                </AlertDescription>
              </div>
            </Alert>
          </div>
        </Section>

        <Section title="Cards, avatars and separators">
          <div className="grid gap-3 md:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle>Compound card</CardTitle>
                <CardDescription>Quiet content surface.</CardDescription>
              </CardHeader>
              <CardContent>
                Header, content and footer compose independently.
              </CardContent>
              <CardFooter className="justify-between text-caption text-muted">
                <span>Course foundation</span>
                <span>72%</span>
              </CardFooter>
            </Card>
            <Card variant="interactive">
              <h3 className="font-semibold">Interactive card</h3>
              <p className="mt-2 text-body-sm text-muted">
                Hover to compare state.
              </p>
            </Card>
            <Card variant="elevated">
              <h3 className="font-semibold">Elevated card</h3>
              <p className="mt-2 text-body-sm text-muted">
                Overlay-level surface.
              </p>
            </Card>
          </div>
          <div className="flex items-center gap-3">
            <Avatar name="Shanity Learner" />
            <Avatar name="Course Mentor" className="size-12" />
            <Avatar name="Design Student">
              <AvatarFallback>DS</AvatarFallback>
            </Avatar>
            <span className="text-body-sm">Learner and mentor</span>
          </div>
          <Separator />
          <p className="text-body-sm text-muted">
            Content continues after a separator.
          </p>
        </Section>

        <Section title="Learning states and loading">
          <div className="space-y-5">
            <div className="space-y-2">
              <div className="flex justify-between text-body-sm">
                <span>Course progress</span>
                <span>72%</span>
              </div>
              <Progress value={72} label="Course progress" />
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge tone="success">Lesson completed</Badge>
              <Badge tone="primary">Current lesson</Badge>
              <Badge>Lesson locked</Badge>
              <Badge tone="success">Quiz correct</Badge>
              <Badge tone="danger">Quiz incorrect</Badge>
              <Badge tone="success">Online</Badge>
              <Badge>Offline</Badge>
            </div>
            <div className="max-w-xl space-y-3" aria-label="Loading preview">
              <Skeleton className="h-5 w-2/5" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-4/5" />
            </div>
          </div>
        </Section>

        <Section title="Shared states">
          <div className="grid gap-4 md:grid-cols-2">
            <EmptyState
              title="No items yet"
              description="A reusable empty state accepts content and an optional action."
              action={<Button size="sm">Create item</Button>}
            />
            <ErrorState
              title="Unable to load content"
              description="A generic error presentation with an optional recovery action."
              action={
                <Button variant="outline" size="sm">
                  Try again
                </Button>
              }
            />
          </div>
          <LoadingState label="Loading shared content" />
        </Section>
      </div>
    </main>
  );
}
