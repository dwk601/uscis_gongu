import { useState, type CSSProperties, type ReactNode } from "react"
import { categoryHue, formHue, formInk } from "@/lib/palette"

export function EstimateCard({
  form,
  title,
  estimatedDate,
  children,
}: {
  form: string
  title: ReactNode
  estimatedDate?: Date
  children: ReactNode
}) {
  const [now] = useState(Date.now)
  return (
    <section
      className="panel estimate"
      style={{ "--hue": formHue(form), color: formInk(form) } as CSSProperties}
    >
      <div>
        <h2>{title}</h2>
        {estimatedDate && estimatedDate.getTime() < now && (
          <p>Past the typical wait.</p>
        )}
      </div>
      <div>{children}</div>
    </section>
  )
}

export function BigNumber({ children }: { children: ReactNode }) {
  return <div className="big-number">{children}</div>
}

export function BulletinCutoffCard({
  category,
  title,
  children,
}: {
  category: string
  title: ReactNode
  children: ReactNode
}) {
  return (
    <section
      className="panel bulletin-card"
      style={{ background: categoryHue(category) }}
    >
      <h2>{title}</h2>
      {children}
    </section>
  )
}
