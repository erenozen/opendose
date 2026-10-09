# Reddit: how to bring it in

Reddit refuses automated access (HTTP 403) to its pages, its `.json`
endpoints and its RSS feeds, and search engines return no Reddit results
for our queries. The research tooling respects that and does not use
archives or proxies to get around it. Two legitimate routes exist:

1. **Export threads by hand.** In a logged-in browser open the thread,
   append `.json` to its URL (for example
   `https://www.reddit.com/r/labrats/comments/abc123/title/.json`) and
   save the page into `docs/research/private/reddit/` (gitignored). Any
   number of files; the analysis runs over all of them. A plain
   "Save page as… HTML only" also works. The most useful subreddits:
   r/labrats, r/AskStatistics, r/statistics, r/bioinformatics,
   r/biology, r/PhD, r/GradSchool, r/pharmacology, r/neuroscience,
   r/immunology, r/molecularbiology, r/microbiology, r/Rlanguage.
   Searches to run there: "graphpad", "prism", "IC50", "which test",
   "post hoc", "technical replicates", "error bars", "superplot",
   "kaplan", "two way anova", "normalize", "ELISA standard curve",
   "qPCR statistics", "western blot quantification statistics".
2. **Register a Reddit API application** (free, personal-use script type,
   at reddit.com/prefs/apps) and put its client id and secret in
   `docs/research/private/reddit.env` as `REDDIT_CLIENT_ID=…` and
   `REDDIT_CLIENT_SECRET=…` with your username. The official OAuth API
   permits read access under Reddit's developer terms, and a script in
   this folder can then pull the threads itself.
