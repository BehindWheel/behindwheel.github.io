import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Grodno Roads — камеры и ремонты дорог",
  description:
    "Публичная карта стационарных камер, участков средней скорости и ремонтов дорог Гродно и области.",
};

// The theme must resolve before the first paint: the stored choice or the
// device scheme gets stamped onto <html data-theme> here, and the token
// blocks in globals.css key off the attribute. Not a module — it has to run
// synchronously ahead of anything that paints.
const THEME_BOOTSTRAP = `(function(){try{var t=localStorage.getItem("theme");if(t!=="light"&&t!=="dark"){t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";}document.documentElement.dataset.theme=t;}catch(e){}})();`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru">
      <body>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
        {children}
      </body>
    </html>
  );
}
