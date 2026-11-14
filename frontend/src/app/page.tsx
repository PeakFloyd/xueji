import Intro from "@/components/intro/Intro";
import { introSans } from "@/components/intro/font";

export default function Home() {
  return (
    <main className={introSans.variable}>
      <Intro fontFamily={introSans.style.fontFamily} />
    </main>
  );
}
