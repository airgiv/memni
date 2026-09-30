import Link from "next/link";
import { EmptyState, FancyIcon } from "@/ui/rapui";
import { Button } from "@/ui/Button";

export default function NotFound() {
  return (
    <div className="page pt-16">
      <EmptyState
        icon={<FancyIcon icon="ghost" tone="plum" float />}
        title="Здесь ничего нет"
        description="Страница не найдена или принадлежит другому пользователю."
        action={
          <Link href="/">
            <Button variant="soft">К мемам</Button>
          </Link>
        }
      />
    </div>
  );
}
