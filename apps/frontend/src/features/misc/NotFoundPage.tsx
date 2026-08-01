import { Link } from 'react-router-dom'
import { Compass } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { EmptyState } from '@/components/ui/States'
import { Button } from '@/components/ui/Button'

export function NotFoundPage() {
  return (
    <>
      <PageHeader title="Page not found" />
      <EmptyState
        icon={Compass}
        title="That page does not exist"
        description="The link may be out of date, or the page may only be available to the secretariat."
        action={
          <Button asChild>
            <Link to="/">Back to dashboard</Link>
          </Button>
        }
      />
    </>
  )
}
