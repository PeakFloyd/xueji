import Experience from "@/components/xueji/Experience";
import { introSans } from "@/components/intro/font";
import { uiSans } from "@/components/xueji/font";

export default function Home() {
  return (
    <main className={`${introSans.variable} ${uiSans.variable}`}>
      <Experience introFont={introSans.style.fontFamily} uiFont={uiSans.style.fontFamily} />
    </main>
  );
}
