"use client";

import dynamic from "next/dynamic";

// The backstage reads the window (size, session storage, the console's hand-off) from its first render,
// so it is rendered on the client only.
const Admin = dynamic(() => import("./Admin"), { ssr: false, loading: () => <div className="xj-root ad-root" /> });

export default function AdminClient({ uiFont }: { uiFont: string }) {
  return <Admin uiFont={uiFont} />;
}
