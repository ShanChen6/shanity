import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Role } from "@/lib/api";

const push = vi.fn();
const setTheme = vi.fn();
const logout = vi.fn();
let roles: Role[] | null = ["student"];
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => "/dashboard",
}));
vi.mock("@/features/auth/session-provider", () => ({
  useSession: () => ({
    user: roles
      ? { id: "u1", email: "u@x.dev", displayName: "U", roles }
      : null,
    status: roles ? "authenticated" : "anonymous",
    logout,
  }),
}));
vi.mock("@/providers/theme-provider", () => ({
  useTheme: () => ({ theme: "system", resolvedTheme: "light", setTheme }),
}));

import { CommandMenuProvider, CommandMenuTrigger } from "./command-menu";

const courseFetch = vi.fn<(url: string) => Promise<Response>>(
  async () =>
    new Response(
      JSON.stringify({
        data: [
          {
            id: "c1",
            title: "JavaScript cơ bản",
            slug: "javascript-co-ban",
            instructor: { displayName: "Lan" },
          },
        ],
        total: 1,
        page: 1,
        limit: 5,
        totalPages: 1,
      }),
      { status: 200 },
    ),
);

function renderMenu() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <CommandMenuProvider>
        <CommandMenuTrigger />
      </CommandMenuProvider>
    </QueryClientProvider>,
  );
}
const dialog = () => screen.queryByRole("dialog", { name: "Tìm kiếm nhanh" });
const input = () => screen.getByRole("combobox");
const options = () => screen.queryAllByRole("option").map((o) => o.textContent);

beforeEach(() => {
  roles = ["student"];
  push.mockReset();
  setTheme.mockReset();
  logout.mockReset();
  courseFetch.mockClear();
  vi.stubGlobal("fetch", courseFetch);
});
afterEach(() => vi.unstubAllGlobals());

describe("opening", () => {
  it("opens from the header trigger and focuses the search field", async () => {
    renderMenu();
    expect(dialog()).toBeNull();
    await userEvent.click(
      screen.getByRole("button", { name: "Tìm kiếm nhanh" }),
    );
    expect(dialog()).toBeInTheDocument();
    expect(input()).toHaveFocus();
  });

  it("toggles with Ctrl+K and Cmd+K from anywhere, even inside a field", async () => {
    renderMenu();
    await userEvent.keyboard("{Control>}k{/Control}");
    expect(dialog()).toBeInTheDocument();
    await userEvent.keyboard("{Control>}k{/Control}");
    expect(dialog()).toBeNull();
    await userEvent.keyboard("{Meta>}k{/Meta}");
    expect(dialog()).toBeInTheDocument();
  });

  it("closes on Escape and on a backdrop click", async () => {
    renderMenu();
    await userEvent.keyboard("{Control>}k{/Control}");
    await userEvent.keyboard("{Escape}");
    expect(dialog()).toBeNull();
    await userEvent.keyboard("{Control>}k{/Control}");
    await userEvent.click(dialog()!);
    expect(dialog()).toBeNull();
  });
});

describe("contents by role", () => {
  it("offers only what a learner may open", async () => {
    renderMenu();
    await userEvent.keyboard("{Control>}k{/Control}");
    const labels = options();
    expect(labels.some((l) => l?.includes("Khóa học"))).toBe(true);
    expect(labels.some((l) => l?.includes("Chấm bài"))).toBe(false);
    expect(labels.some((l) => l?.includes("Cài đặt hệ thống"))).toBe(false);
  });

  it("adds instructor destinations and a workspace switch for instructors", async () => {
    roles = ["student", "instructor"];
    renderMenu();
    await userEvent.keyboard("{Control>}k{/Control}");
    const labels = options();
    expect(labels.some((l) => l?.includes("Chấm bài"))).toBe(true);
    expect(labels.some((l) => l?.includes("Tạo khóa học mới"))).toBe(true);
    expect(
      labels.some((l) => l?.includes("Chuyển tới không gian giảng viên")),
    ).toBe(true);
  });

  it("shows sign-in links and no account actions to visitors", async () => {
    roles = null;
    renderMenu();
    await userEvent.keyboard("{Control>}k{/Control}");
    const labels = options();
    expect(labels.some((l) => l?.includes("Đăng nhập"))).toBe(true);
    expect(labels.some((l) => l?.includes("Đăng xuất"))).toBe(false);
  });
});

describe("searching", () => {
  it("finds items without diacritics and says so when nothing matches", async () => {
    renderMenu();
    await userEvent.keyboard("{Control>}k{/Control}");
    await userEvent.type(input(), "don hang");
    expect(options()).toHaveLength(1);
    expect(options()[0]).toContain("Đơn hàng");
    await userEvent.clear(input());
    await userEvent.type(input(), "zzzz");
    expect(
      screen.getByText(/Không tìm thấy kết quả cho “zzzz”/),
    ).toBeInTheDocument();
  });

  it("searches public courses once two characters are typed", async () => {
    renderMenu();
    await userEvent.keyboard("{Control>}k{/Control}");
    await userEvent.type(input(), "ja");
    const result = await screen.findByRole("option", {
      name: /JavaScript cơ bản/,
    });
    expect(courseFetch).toHaveBeenCalledTimes(1);
    expect(String(courseFetch.mock.calls[0]![0])).toContain(
      "/public/courses?search=ja&page=1&limit=5",
    );
    await userEvent.click(result);
    expect(push).toHaveBeenCalledWith("/courses/javascript-co-ban");
    expect(dialog()).toBeNull();
  });

  it("does not hit the API for a single character", async () => {
    renderMenu();
    await userEvent.keyboard("{Control>}k{/Control}");
    await userEvent.type(input(), "j");
    await new Promise((resolve) => setTimeout(resolve, 350));
    expect(courseFetch).not.toHaveBeenCalled();
  });
});

describe("keyboard", () => {
  it("moves the active option with the arrows and wraps around", async () => {
    renderMenu();
    await userEvent.keyboard("{Control>}k{/Control}");
    const selected = () =>
      screen
        .getAllByRole("option")
        .findIndex((o) => o.getAttribute("aria-selected") === "true");
    expect(selected()).toBe(0);
    await userEvent.keyboard("{ArrowDown}");
    expect(selected()).toBe(1);
    await userEvent.keyboard("{ArrowUp}{ArrowUp}");
    expect(selected()).toBe(screen.getAllByRole("option").length - 1);
    await userEvent.keyboard("{Home}");
    expect(selected()).toBe(0);
  });

  it("keeps aria-activedescendant on the highlighted option", async () => {
    renderMenu();
    await userEvent.keyboard("{Control>}k{/Control}");
    await userEvent.keyboard("{ArrowDown}");
    const active = input().getAttribute("aria-activedescendant");
    expect(active).toBeTruthy();
    expect(document.getElementById(active!)).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(input()).toHaveAttribute(
      "aria-controls",
      screen.getByRole("listbox").id,
    );
  });

  it("opens the highlighted destination on Enter", async () => {
    renderMenu();
    await userEvent.keyboard("{Control>}k{/Control}");
    await userEvent.type(input(), "khoa hoc");
    await userEvent.keyboard("{Enter}");
    expect(push).toHaveBeenCalledWith("/courses");
    expect(dialog()).toBeNull();
  });
});

describe("actions", () => {
  it("switches the theme and closes", async () => {
    renderMenu();
    await userEvent.keyboard("{Control>}k{/Control}");
    await userEvent.type(input(), "toi");
    await userEvent.click(
      within(screen.getByRole("listbox")).getByRole("option", {
        name: /Giao diện tối/,
      }),
    );
    expect(setTheme).toHaveBeenCalledWith("dark");
    expect(dialog()).toBeNull();
  });

  it("signs out from the palette", async () => {
    renderMenu();
    await userEvent.keyboard("{Control>}k{/Control}");
    await userEvent.type(input(), "dang xuat");
    await userEvent.keyboard("{Enter}");
    await waitFor(() => expect(logout).toHaveBeenCalledOnce());
  });
});
