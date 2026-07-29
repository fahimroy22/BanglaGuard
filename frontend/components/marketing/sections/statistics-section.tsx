const statistics = [
  {
    value: "3",
    label: "Core NLP tasks",
    description: "Hate speech, sentiment, and future fake-news analysis.",
  },
  {
    value: "2+",
    label: "Model families",
    description: "Classical baselines and transformer architectures.",
  },
  {
    value: "100%",
    label: "Explainable workflow",
    description: "Predictions, probabilities, explanations, and feedback.",
  },
  {
    value: "24/7",
    label: "Research API",
    description: "Production-ready backend with monitored services.",
  },
];

export function StatisticsSection() {
  return (
    <section
      id="research"
      className="scroll-mt-24 border-b bg-muted/30"
    >
      <div className="
          mx-auto grid max-w-7xl
          divide-y px-5
          sm:grid-cols-2 sm:px-8
          lg:grid-cols-4 lg:divide-x lg:divide-y-0
        ">
        {statistics.map((statistic) => (
          <div
            key={statistic.label}
            className="px-4 py-8 sm:px-6 sm:py-10 lg:py-12"
          >
            <p className="text-4xl font-bold tracking-tight">
              {statistic.value}
            </p>
            <p className="mt-2 font-semibold">
              {statistic.label}
            </p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {statistic.description}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
