import type { Metadata } from "next";
import type { ReactNode } from "react";
import { spaceGrotesk, jetBrainsMono } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "xGameFi",
  description: "Commerce infrastructure for game studios.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${spaceGrotesk.variable} ${jetBrainsMono.variable}`}>
      <head>
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,400,0,0"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
