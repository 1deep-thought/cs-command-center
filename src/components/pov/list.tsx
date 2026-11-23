import { NoAccessCard, SignInCard, SignOutButton } from "@/components/auth/sign-in";
import { HEADER_ROW } from "@/components/renewals/layout";
import { AuthRequiredError, NotAuthorizedError } from "@/lib/auth";
import { getPovList, getViewerEmail } from "@/lib/pov-api";
import type { PovListItem } from "@/types/pov";
import { PovListView } from "./list-view";
import { NewPovForm } from "./new-pov-form";

export const LIST_TITLE = "Proof of Value";

export function ListTitle() {
  return (
    <h1 className="text-[15px] leading-7 font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">{LIST_TITLE}</h1>
  );
}

// Async server component: uncached API fetch, so it must render inside <Suspense>.
export async function PovList() {
  let povs: PovListItem[];
  let viewer: string | null;
  try {
    [povs, viewer] = await Promise.all([getPovList(), getViewerEmail()]);
  } catch (error) {
    if (error instanceof AuthRequiredError) return <SignInCard expired={error.expired} />;
    if (error instanceof NotAuthorizedError) return <NoAccessCard />;
    throw error;
  }
  return (
    <>
      <header className={HEADER_ROW}>
        <ListTitle />
        <NewPovForm />
      </header>
      <PovListView povs={povs} viewer={viewer} />
      <div className="flex h-4 items-center justify-end">
        <SignOutButton variant="link" />
      </div>
    </>
  );
}
