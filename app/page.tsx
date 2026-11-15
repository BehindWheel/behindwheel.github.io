import HomeClient from "@/components/HomeClient";

// The map renders client-side only (HomeClient), so the static export ships
// just a loading placeholder — nothing for a crawler to read. This
// server-rendered block is the page's indexable face: the same facts as the
// meta description plus the region names a query would carry, visually
// hidden but honest — it describes exactly what the site shows.
export default function Home() {
  return (
    <>
      <section className="sr-only">
        <h1>Grodno Roads — камеры и ремонты дорог</h1>
        <p>
          Публичная карта стационарных камер контроля скорости, участков
          средней скорости и ремонтов дорог: Гродненская, Минская, Брестская,
          Витебская, Гомельская и Могилёвская области. Данные обновляются
          автоматически; выбранный объект кодируется в адресе страницы.
        </p>
      </section>
      <HomeClient />
    </>
  );
}
