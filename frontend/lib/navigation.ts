import {
  LayoutDashboard,
  Brain,
  Database,
  FlaskConical,
  MessageSquareText,
  BarChart3,
  ShieldCheck,
  Settings,
  Users,
  Boxes,
} from "lucide-react";

export const navigation = [
  {
    title: "Workspace",
    items: [
      {
        title: "Dashboard",
        href: "/dashboard",
        icon: LayoutDashboard,
      },
      {
        title: "Predictions",
        href: "/prediction",
        icon: MessageSquareText,
      },
      {
        title: "Analytics",
        href: "/analytics",
        icon: BarChart3,
      },
    ],
  },

  {
    title: "AI Development",
    items: [
      {
        title: "Datasets",
        href: "/datasets",
        icon: Database,
      },
      {
        title: "Experiments",
        href: "/experiments",
        icon: FlaskConical,
      },
      {
        title: "Models",
        href: "/models",
        icon: Brain,
      },
    ],
  },

  {
    title: "Quality",
    items: [
      {
        title: "Feedback",
        href: "/feedback",
        icon: ShieldCheck,
      },
      {
        title: "Audit Logs",
        href: "/audit-logs",
        icon: Boxes,
      },
    ],
  },

  {
    title: "System",
    items: [
      {
        title: "Users",
        href: "/users",
        icon: Users,
      },
      {
        title: "Settings",
        href: "/settings",
        icon: Settings,
      },
    ],
  },
];