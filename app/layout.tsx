import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Grodno Roads — камеры и ремонты дорог",
  description:
    "Публичная карта стационарных камер, участков средней скорости и ремонтов дорог Гродно и области.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
