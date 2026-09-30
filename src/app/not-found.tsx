import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-4 pt-24 text-center">
      <p className="text-[17px]">Здесь ничего нет</p>
      <Link href="/" className="rounded-lg bg-surface-2 px-4 py-2 text-[14px] hover:bg-[#2a2a2f]">
        К мемам
      </Link>
    </div>
  );
}
