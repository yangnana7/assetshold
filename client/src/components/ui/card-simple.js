import * as React from "react"

const Card = ({ className, children, ...props }) => {
  return React.createElement(
    'div',
    {
      className: `rounded-lg border bg-card text-card-foreground shadow-sm ${className || ''}`,
      ...props
    },
    children
  )
}

const CardHeader = ({ className, children, ...props }) => {
  return React.createElement(
    'div',
    {
      className: `flex flex-col space-y-1.5 p-6 ${className || ''}`,
      ...props
    },
    children
  )
}

const CardTitle = ({ className, children, ...props }) => {
  return React.createElement(
    'h3',
    {
      className: `text-2xl font-semibold leading-none tracking-tight ${className || ''}`,
      ...props
    },
    children
  )
}

const CardDescription = ({ className, children, ...props }) => {
  return React.createElement(
    'p',
    {
      className: `text-sm text-muted-foreground ${className || ''}`,
      ...props
    },
    children
  )
}

const CardContent = ({ className, children, ...props }) => {
  return React.createElement(
    'div',
    {
      className: `p-6 pt-0 ${className || ''}`,
      ...props
    },
    children
  )
}

const CardFooter = ({ className, children, ...props }) => {
  return React.createElement(
    'div',
    {
      className: `flex items-center p-6 pt-0 ${className || ''}`,
      ...props
    },
    children
  )
}

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent }