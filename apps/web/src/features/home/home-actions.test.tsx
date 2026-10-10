import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

let user: { displayName: string } | null = null;
let status = "anonymous";
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("@/features/auth/session-provider", () => ({
  useSession: () => ({ user, status }),
}));
vi.mock("@/features/progress/resume-learning", () => ({
  ResumeLearning: () => <div>resume-learning</div>,
}));

import { HomeActions, HomeClosingCta, HomeResume } from "./home-actions";

const hrefs = () =>
  screen.getAllByRole("link").map((link) => link.getAttribute("href"));

beforeEach(() => {
  user = null;
  status = "anonymous";
});

describe("HomeActions", () => {
  it("sends visitors to the catalog and to sign-up", () => {
    render(<HomeActions />);
    expect(hrefs()).toEqual(["/courses", "/register"]);
  });

  it("holds back the sign-up link while the session loads", () => {
    status = "loading";
    render(<HomeActions />);
    expect(hrefs()).toEqual(["/courses"]);
  });

  it("sends learners back to their courses first", () => {
    user = { displayName: "Lan" };
    status = "authenticated";
    render(<HomeActions />);
    expect(hrefs()).toEqual(["/my-learning", "/courses"]);
  });
});

describe("HomeResume", () => {
  it("shows the resume card to signed-in learners only", () => {
    const { unmount } = render(<HomeResume />);
    expect(screen.queryByText("resume-learning")).toBeNull();
    unmount();
    user = { displayName: "Lan" };
    status = "authenticated";
    render(<HomeResume />);
    expect(screen.getByText("resume-learning")).toBeInTheDocument();
  });
});

describe("HomeClosingCta", () => {
  it("invites visitors to sign up or sign in", () => {
    render(<HomeClosingCta />);
    expect(hrefs()).toEqual(["/register", "/login"]);
  });

  it("points learners to their courses and schedule", () => {
    user = { displayName: "Lan" };
    status = "authenticated";
    render(<HomeClosingCta />);
    expect(hrefs()).toEqual(["/my-learning", "/student/dashboard/schedule"]);
  });

  it("renders nothing while the session loads", () => {
    status = "loading";
    const { container } = render(<HomeClosingCta />);
    expect(container).toBeEmptyDOMElement();
  });
});
