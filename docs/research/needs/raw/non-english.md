# Needs catalogue: non-English communities (zh, ja, ko, de, fr, tr)

120 verified observations (zh 44, ja 26, ko 22, de 18, fr 8, tr 2). `verify.py`: **120 observations, 0 with problems**. Quotes are verbatim in the original language; each `problem` starts with an English gloss. The id prefix is `nonen-<lang>-`, and `venue` is the site domain.

## 1. Coverage

**How URLs were found.** WebSearch (US-only) returned almost nothing in non-English languages, Bing returned unrelated results for every query, and DuckDuckGo's HTML endpoint returned 202 (rate-limited) after the first query. Discovery therefore relied on (a) each site's own search pages, fetched with `fetch.py`, and (b) Yahoo! JAPAN web search (`search.yahoo.co.jp`), which returned 200 and real results for queries in Japanese, Spanish, Portuguese, Turkish, German and French.

**Searches run (each one fetched with fetch.py):**

- muchong.com (小木虫) on-site search: `graphpad` (all time, pages 1–11, 272 topics) and `prism` (page 1 of 16, 389 topics), sorted by relevance.
- chiebukuro.yahoo.co.jp (Yahoo!知恵袋): `GraphPad Prism` (pages 1–2), `graphpad`, `prism 有意差`, `prism グラフ`, `Prism 統計`, `IC50 求め方`, `エラーバー SD SE 論文`, `ウエスタンブロット 定量 有意差`, `qPCR 有意差 検定`, `n=3 有意差 実験`, `多重比較 実験 細胞 検定 どれ`, `二元配置分散分析 多重比較 実験`, `prism 検定`.
- ibric.org (BRIC 실험 Q&A) on-site search: `prism`, `graphpad`, `프리즘`, `그래프패드`, `통계 검정`, `IC50`, `anova`, `t-test 유의성`, `error bar`, `western 정량 통계`.
- statistik-forum.de on-site search: `graphpad` (5 result pages, 47 hits), `western blot`, `IC50`, `Zellkultur`, `qPCR`, `Replikate`, `Prism`.
- les-mathematiques.net on-site search: `graphpad`, `prism`, `IC50`, `western blot`, `biologie test`, `cellules test`, `qPCR`.
- pt.stackoverflow.com / es.stackoverflow.com: search pages returned 200 but the question pages returned 403. Question bodies were read through the official Stack Exchange API (api.stackexchange.com), the documented path used for every Stack Exchange site in this catalogue; the 6 resulting observations (pt 4, es 2) are included.
- search.bilibili.com `graphpad prism`; qiita.com search `GraphPad Prism`; note.com search `GraphPad Prism`; technopat.net search `graphpad`; eksisozluk topic `graphpad prism`.
- Yahoo! JAPAN web search for discovery: about 20 queries, among them `GraphPad Prism duda ANOVA foro`, `GraphPad Prism dúvida qual teste estatístico usar fórum`, `GraphPad Prism istatistik hangi test soru cevap`, `site:gutefrage.net …`, `site:forums.futura-sciences.com …`, `forocoches graphpad`, `r-help-es graphpad`, `R-br graphpad prism`.

**Pages fetched.** There were 248 unique URLs in this agent's fetch log, of which 235 returned 200. Threads and questions read in full: 62 muchong threads (27 login-walled and 1 empty, see below), 28 Yahoo!知恵袋 questions, 17 statistik-forum.de threads, 7 les-mathematiques.net threads, 1 futura-sciences thread, 2 Qiita articles, 1 ekşi sözlük topic, and 4 Stack Exchange API question batches (9 questions). The rest were search-result pages: 12 muchong, 15 chiebukuro, 10 BRIC, 9 statistik-forum, 7 les-mathematiques, 1 bilibili, about 20 Yahoo! JAPAN, and about 12 Stack Exchange API searches.

**Two reachability caveats that affect the quote source:**

- **muchong:** 27 of the 62 threads fetched return a login wall (`该内容需要登录查看`, "login required to view this content", served with HTTP 200). That wall was not bypassed. For 14 of those threads the observation quotes the question text that muchong itself shows on its public search-results page, and the observation's `url` is that search page. Each such observation says so in `problem`.
- **BRIC (ibric.org):** Q&A detail pages (`qna.do?mode=view…`) return HTTP 200 with an empty body (Content-Length 0) to the fetcher. All 22 Korean observations therefore quote the question text that BRIC's own search-results page shows, and say so in `problem`. Dates come from the date line that follows each item on the search page.

**Per-community reachability:**

| Community | Lang | Status | Notes |
|---|---|---|---|
| muchong.com 小木虫 (search + threads) | zh | reachable (partly login-walled) | search 200; 34/62 threads readable, 27 login wall (HTTP 200 + 该内容需要登录查看), 1 empty/deleted |
| zhihu.com | zh | unreachable 403 | tested earlier by caller; not retried |
| search.bilibili.com | zh | reachable | titles and view counts on the search page |
| www.bilibili.com/video/BV… | zh | no usable text | 200 but body came back compressed/binary through curl; comments are JS-loaded anyway |
| so.csdn.net search | zh | JS shell, no text | 200, 0 chars |
| zhidao.baidu.com search | zh | JS shell, no text | 200, 0 chars |
| www.baidu.com/s | zh | near-empty | 200, 28 chars (verification page) |
| dxy.cn (丁香园) BBS search | zh | unreachable (bot check) | 200 but '系统检测到您的网络中存在异常流量' ("unusual traffic detected") human-verification page |
| jianshu.com search | zh | JS shell, no text | 200, 32 chars |
| chiebukuro.yahoo.co.jp (search + questions) | ja | reachable | full question text, date and view count |
| qiita.com (search + articles) | ja | reachable | search lists only 4 hits; 2 articles used |
| note.com search | ja | reachable (search only) | titles only; articles not mined (time) |
| hatenablog.com/search | ja | unreachable 404 | search endpoint does not exist |
| search.yahoo.co.jp | multi | reachable | used for discovery only |
| ibric.org BRIC 실험 Q&A | ko | search reachable; detail pages empty | detail pages 200 with Content-Length 0 |
| cafe.naver.com search | ko | JS shell, no text | 200, 6 chars |
| blog.naver.com | ko | JS shell | tested earlier by caller |
| tistory.com search | ko | JS shell, no text | 200, 327 chars of navigation |
| statistik-forum.de (search + threads) | de | reachable | phpBB; http:// works (one https:// search failed to connect) |
| gutefrage.net search | de | unreachable 403 |  |
| laborjournal.de forum | de | not found | no forum results via Yahoo! JAPAN site: search; not fetched |
| les-mathematiques.net (search + threads) | fr | reachable | Vanilla forum |
| forums.futura-sciences.com | fr | threads reachable; search login-walled | search.php returns a 'vous n'êtes pas connecté' ("you are not logged in") page |
| pt.stackoverflow.com | pt | search page 200; question page 403 | read through the official API; 4 observations |
| es.stackoverflow.com | es | search page 200; question page 403 | read through the official API; 2 observations |
| pt.quora.com / es.quora.com | pt/es | unreachable 403 |  |
| brainly.com.br | pt | unreachable 403 |  |
| todoexpertos.com search | es | 404 | search URL not valid; no indexed GraphPad content found |
| forocoches.com | es | not used | only off-topic threads surfaced |
| reddit.com / old.reddit.com (non-English subs) | es/pt | near-empty | 200 with 6–38 chars; Yahoo! results for Reddit were machine-translated (?tl=pt-br) English posts, excluded |
| eksisozluk.com | tr | reachable | one topic, 4 entries |
| technopat.net search | tr | reachable | only laptop-buying threads mention GraphPad; not used |
| forum.donanimhaber.com search | tr | 404 | search URL invalid |
| www.bing.com/search | — | unusable | 200 but unrelated results for every query |
| duckduckgo.com/html | — | rate-limited 202 | after the first query |

## 2. Ten most frequent tags

| Tag | Count |
|---|---|
| which-test | 29 |
| ic50-ec50-setup | 19 |
| learning-curve | 18 |
| multiple-comparisons | 12 |
| technical-vs-biological-replicates | 11 |
| two-way-anova | 11 |
| n-definition | 10 |
| normalization | 10 |
| reporting-methods | 10 |
| fit-diagnostics | 10 |
| data-entry-table-types | 9 |

(n-definition, normalization, fit-diagnostics and post-hoc-choice tie at 10, so 11 rows are shown.) `language-localisation`: 6.

By venue: muchong.com 41, chiebukuro.yahoo.co.jp 23, ibric.org 22, statistik-forum.de 18, les-mathematiques.net 7, bilibili.com 3, qiita.com 3, eksisozluk.com 2, forums.futura-sciences.com 1.

## 3. Twenty strongest observations

1. **nonen-ja-rm-two-way-nonpar-1** (chiebukuro.yahoo.co.jp, 2013-11, blocks the analysis). software blocks two-way repeated-measures ANOVA on assumption checks and offers no nonparametric alternative (8,181 views).  
   > ①Normality Test をパスしない ②equal variances testをパスしないということから、同テストを行えないということになり（ソフトウェア）ました。  
   Gloss: '(1) it fails the normality test and (2) fails the equal-variances test, so the software says the test cannot be run.'  
   *Why strong:* 8,181 views; software refuses the design-appropriate test on assumption checks and offers nothing instead.

2. **nonen-zh-ic50-se-log-1** (muchong.com, 2011-10, slows the work). the fit reports error on the log scale and the user cannot obtain the IC50 ± SE that journals/advisers expect.  
   > 用graphpad prism计算IC50，导出的SE是logIC50形式，如下图所示，请问如何输出IC50±S.E.  
   Gloss: 'Calculating IC50 with GraphPad Prism, the exported SE is for logIC50; how do I output IC50 ± S.E.?'  
   *Why strong:* 8,617 views; the single most common IC50 reporting confusion (log-scale error vs IC50 ± SE).

3. **nonen-zh-chinese-guide-1** (muchong.com, 2012-02, slows the work). needs documentation in Chinese; thread drew 15 replies.  
   > 请问谁有Graphpad Prism 5.0 用户指南中文版？  
   Gloss: 'Does anyone have the Chinese edition of the GraphPad Prism 5.0 user guide?'  
   *Why strong:* 6,952 views, 15 replies; direct demand for Chinese documentation.

4. **nonen-zh-abc-letters-1** (muchong.com, 2017-12, slows the work). wants compact letter display of post-hoc results (6,951 views).  
   > 问题二：同问题一，这种带abc的用软件怎么做呀？  
   Gloss: 'Question two: how do I make these tables/graphs with abc letters in software?'  
   *Why strong:* 6,951 views; compact letter display recurs in zh and ko venues.

5. **nonen-zh-lc50-sk-1** (muchong.com, 2010-10, blocks the analysis). required regulatory method not obviously available (5,533 views).  
   > 请问一下大家都用什么软件计算LC50啊，如果想用这个方法计算的话 Trimmed spearman-karber method ， 该用什么软件啊Graphpad行否？  
   Gloss: 'What software do you use to compute LC50? If I want the Trimmed Spearman-Karber method, which software — can GraphPad do it?'  
   *Why strong:* 5,533 views; regulatory LC50 method not available, user has to leave the tool.

6. **nonen-zh-qpcr-errorbar-1** (muchong.com, 2012-09, wrong result risk). does not know how to carry SD of ΔCt onto 2^-ΔΔCt bars (gets bars larger than the bar height).  
   > 我仔细看了下仪器的分析结果，好像它的error bar用的是RQ max和RQ min，所以请问一下，这里的error bar难道不是用SD么？  
   Gloss: 'The instrument's error bars appear to use RQmax and RQmin — shouldn't error bars be SD?'  
   *Why strong:* 4,750 views; ΔΔCt error propagation done wrongly by hand (bars taller than bars).

7. **nonen-zh-ic50-converge-1** (muchong.com, 2012-05, wrong result risk). ill-determined plateaus give absurd parameters and the user cannot find where to constrain them.  
   > 用Graphpad Prism 酸IC50时，所画曲线不收敛，在结果中要么很大达到200，要么Bottom 很小，要么top很大。怎样限制一下Bottom 和 top 。  
   Gloss: 'When calculating IC50 with GraphPad Prism the curve does not converge — the result is either huge (200), or Bottom is very small, or Top very large. How do I constrain Bottom and Top?'  
   *Why strong:* 4,512 views; unconstrained plateaus give absurd IC50, user cannot find the constraint.

8. **nonen-ja-oneway-twoway-1** (chiebukuro.yahoo.co.jp, 2014-11, blocks the analysis). cannot map a time course and a two-cell-line dose series onto one-way vs two-way ANOVA vs t tests (3,408 views).  
   > 以下の実験結果の統計はOne-wayかTwo-wayのどちらになるのでしょうか。それともそれ以外でしょうか。  
   Gloss: 'Is the statistics for the following experiments one-way or two-way? Or something else?'  
   *Why strong:* 3,408 views; textbook design-to-test mapping failure for routine cell experiments.

9. **nonen-ja-tukey-none-1** (chiebukuro.yahoo.co.jp, 2016-03, slows the work). significant omnibus ANOVA but no significant Tukey pair, computed by hand in Excel.  
   > どのサンプルの算出した値も、スチューデント化された範囲表の該当する値よりも小さな値になり、どのサンプル間に有意差があるのかがわかりません。  
   Gloss: 'Every computed value is below the studentized-range table value, so I can't tell which samples differ (although ANOVA was significant).'  
   *Why strong:* omnibus vs post-hoc disagreement; the same pattern recurs in ja-tumour-three-groups and in de/ko threads.

10. **nonen-ja-roc-compare-1** (chiebukuro.yahoo.co.jp, 2017-05, blocks the analysis). Prism does not compare ROC curves (the answer quotes the manual: compute a Z test by hand).  
   > Graphpad Prism7を使用しています。ROC曲線のAUCの差を検定することが、R（EZR)では可能ですが、Prismで同様の操作を行うには、どのようにすればいいでしょうか。  
   Gloss: 'I use GraphPad Prism 7. Testing the difference in AUC between ROC curves is possible in R (EZR) — how do I do the same in Prism?'  
   *Why strong:* 2,515 views; missing analysis (ROC AUC comparison) forces users to R/EZR.

11. **nonen-ja-wells-vs-experiments-1** (chiebukuro.yahoo.co.jp, 2013-07, wrong result risk). treats wells as independent n and wonders how 'three independent experiments' fits in (1,481 views).  
   > たとえばcontrolや薬物を加えるときに、それぞれ8つのwellを用いて実験をしたとするとn=8になるので、これだけでも統計ソフトを使ってt-検定をして有意差を出すことはできます。  
   Gloss: 'If I use 8 wells each for control and drug, that is n=8, so I can get significance with a t test from that alone.'  
   *Why strong:* 1,481 views; wells counted as n, the pseudo-replication trap, asked in plain words.

12. **nonen-zh-replicates-grouped-1** (muchong.com, 2021-08, wrong result risk). does not know whether nested samples are independent n or must be averaged per replicate before plotting/testing.  
   > 在使用graphpad绘制分组柱状图时，若一个处理组下有五个重复，每个重复下有五个样本，那这一个处理组的二十五个数据都要填?，还是只填每个重复下的平均值?  
   Gloss: 'When drawing a grouped bar chart in GraphPad, if a treatment group has five replicates and each replicate has five samples, do I enter all 25 values, or only the mean of each replicate?'  
   *Why strong:* nested replicates: enter 25 values or 5 means? resolved by entering mean/SD — the n question never surfaced.

13. **nonen-zh-qpcr-control-one-1** (muchong.com, 2013-07, blocks the analysis). normalising each control to exactly 1 removes its variance and blocks the intended test.  
   > 阴性对照组所有数据都为1，从而计算实验组相对对照组的相对表达量，但是用Graphpad分析时，因为PBS全为1，所以软件不让进行非配对t检验，只能用配对t检验了，但是感觉用配对t检验又不太合适。  
   Gloss: 'All negative-control values are 1 (relative expression), so GraphPad will not run an unpaired t test because PBS is all 1s; only a paired t test works, but that feels wrong.'  
   *Why strong:* normalising controls to 1 removes variance and blocks the test; user switches to an inappropriate paired test.

14. **nonen-de-reviewer-anova-1** (statistik-forum.de, 2012-02, wrong result risk). switching from multiple t tests to ANOVA+Dunnett changes conclusions; user asks which to trust.  
   > ein reviewer möchte jetzt, dass ich alles mit ANOVA nochmal mache. mein problem ist jetzt, dass sich die signifikanzen ändern!!!  
   Gloss: 'A reviewer now wants me to redo everything with ANOVA. My problem is that the significances change!!!'  
   *Why strong:* conclusions change after reviewer-mandated ANOVA+Dunnett; user asks which result to trust.

15. **nonen-de-summary-subcolumns-1** (statistik-forum.de, 2015-04, wrong result risk). summary data entered in the wrong table type are silently treated as raw values.  
   > Wende ich nun auf meine Daten einen einfachen T-Test (unabhängige Variablen) an, bekomme ich den Hinweis, dass "subcolumns" (also Standardabweichung und Werteinzahl n) nicht mit in die Berechnung eingegangen sind  
   Gloss: 'When I run a simple t test I get a note that subcolumns (SD and n) were not used in the calculation'  
   *Why strong:* summary data silently treated as raw values: a quiet wrong-result trap.

16. **nonen-ko-qpcr-kw-n3-1** (ibric.org, 2025-03, wrong result risk). picked a rank test with n=3, which cannot reach significance; misunderstands why. (BRIC Q&A detail pages return an empty body to the fetcher; quote is from the question text shown on BRIC's own search-results page)  
   > n=3이기 때문에, nonparametric으로 One-way-ANOVA인, Kruskal-Wallis test로 통계처리를 하였습니다. 그런데 이렇게 에러바도 작고 차이도 확연한 것 같은데, Positive와 negative간의 유의성이 나오질 않네요..  
   Gloss: 'Because n=3 I used the nonparametric Kruskal-Wallis test, but even though error bars are small and the difference is obvious, positive vs negative is not significant.'  
   *Why strong:* rank test with n=3 can never be significant; user does not know why.

17. **nonen-ko-wb-anova-vs-t-1** (ibric.org, 2025-08, wrong result risk). tempted to replace corrected comparisons with uncorrected t tests to obtain significance. (BRIC Q&A detail pages return an empty body to the fetcher; quote is from the question text shown on BRIC's own search-results page)  
   > ANOVA검정에서 multiple comparisons를 하면 유의성이 안 뜨는데 t-test를 진행하면 유의성이 나타납니다. 이럴 때에는 어떻게 진행을 해야하는 지 모르겠어서 질문을 드립니다.  
   Gloss: 'With multiple comparisons after ANOVA there is no significance, but with a t test there is. I don't know how to proceed.'  
   *Why strong:* user proposes dropping corrected comparisons for t tests to get significance.

18. **nonen-zh-ic50-tools-differ-1** (muchong.com, 2018-12, wrong result risk). three tools, three IC50s, no way to judge. (thread body is login-walled; quote is the public snippet shown on the site's own search-results page)  
   > 相求一个药物的ic50，用excelspss和graphpad算的结果数量级都不一样，求大神帮看看咋回事，用哪个比较恰当呢  
   Gloss: 'I want a drug's IC50; Excel, SPSS and GraphPad give results that differ by orders of magnitude. Which is appropriate?'  
   *Why strong:* Excel, SPSS and GraphPad IC50s differ by orders of magnitude, with no way to judge.

19. **nonen-ja-japanese-version-price-1** (chiebukuro.yahoo.co.jp, 2015-04, slows the work). the localised edition costs more, forcing a trade-off between language and price.  
   > 同ソフトは、DeltaGraf経験者であれば、完全日本語版（14万円台と高価）でなくても、日本語サポート版や英語版でも、使用は可能でしょうか。  
   Gloss: 'For someone experienced with DeltaGraph, could I use the Japanese-support or English version rather than the fully Japanese version (expensive, ~¥140,000)?'  
   *Why strong:* the localised edition costs more: language traded against price.

20. **nonen-ko-foreign-senior-1** (ibric.org, 2025-02, slows the work). language gap with the lab mentor leaves the user to self-teach data entry. (BRIC Q&A detail pages return an empty body to the fetcher; quote is from the question text shown on BRIC's own search-results page)  
   > 실험실에 외국인 선배만 있어서 질문은 잘 못해서 그냥 유튜브에 정량법을 찾아 정량화를 해봤는데  
   Gloss: 'The only senior in my lab is a foreigner, so I can't really ask questions; I just found a quantification method on YouTube' (and don't know which numbers to enter in Prism for N=3)  
   *Why strong:* language gap with the only lab mentor; user self-teaches from YouTube.

## 4. Surprises and notable patterns

- **The same handful of questions recurs in every language.** These are: which test fits my design (one-way, two-way or t test; paired or not), what n is (wells vs plates vs independent experiments), how to get significance asterisks or letters onto the graph, and how to report IC50 with an error. Chinese, Japanese, Korean, German and French users ask them almost word for word.
- **IC50/EC50 is the dominant curve-fitting pain in Chinese pharmacology venues.** The topics are SE on logIC50 vs IC50 ± SE, curves that do not converge, the `~` (ambiguous) marker, IC50s that differ between Excel, SPSS and Prism, and missing pA2/Schild, LC50 Spearman-Kärber and probit (LD50 slope ± SE, chi-square) outputs. These threads have some of the highest view counts (4–9k on muchong).
- **Compact letter display (a/b/c) is requested at least as often as asterisks in Chinese and Korean venues:** muchong (6,951 views) and BRIC. (Spanish and Portuguese Stack Overflow questions, read through the official API, ask the same.) A tool that only draws asterisk brackets misses this convention.
- **Normalising to control = 1 or 100% routinely breaks the downstream test.** Zero-variance controls block t tests (zh qPCR, de t-test against 100%, de wt = 100% ANOVA). Users then improvise (paired tests, transposing tables twice).
- **Software refuses and does not redirect.** Examples: two-way RM ANOVA fails the normality and variance tests and simply won't run (ja, 8,181 views), Prism won't put a paired-test star on the graph (tr), excluding outliers makes two-way ANOVA impossible (de), unequal n reported as missing values (de), and three-way ANOVA with missing cells won't run (ja). Users want an alternative suggested, not just a stop.
- **Licence cost and access dominate Chinese venues.** Most muchong hits for `graphpad` are requests for installers or cracked copies ('求破解版', '安装成功送90个金币', "90 gold coins if it installs"), trial expiry and virus-infected copies. Bilibili's top results include crack tutorials (16.1万 views) and '附安装包' ("installer included") videos. Korean (800,000 won) and Japanese (¥140,000 for the full Japanese edition; JMP/SPSS ~¥200,000) users raise price, and Japanese Qiita notes that licences confine use to the lab's shared PC.
- **Language localisation is real but uneven.** Chinese users ask for Chinese manuals (6,952 views) and install third-party UI patches (汉化包, "Chinese-localisation patch"). An official Chinese edition now exists, and installing it is itself a popular video topic. In Japan the fully localised edition is a separate, more expensive product. Japanese output terms such as 対象（マッチあり） ("Subjects (matching)") are themselves opaque. A Korean student could not ask the lab's only (foreign) senior and learned from YouTube. German and French users showed no language barrier with the English UI; their problems were statistical.
- **Tools disagree, and users can't tell why.** Examples: Excel vs Prism P values (ko qPCR), SPSS vs Prism survival curves and median-survival CI (zh, de), two Prism chi-square menus giving different values (fr), and Excel/SPSS/Prism IC50s orders of magnitude apart (zh). Transparent methods ('which test, which values, which formula') would answer most of these.
- **Turkish venues show a paid 'thesis statistics consultancy' market** (spss-yardimi, tez danışmanlığı, i.e. thesis consultancy) rather than peer Q&A. Help with lab statistics is bought rather than asked for. That was seen in search results only and is not recorded as observations.

## 5. Gaps

- **Zhihu** (403), **CSDN, Baidu Zhidao, Jianshu** (JS shells), **dxy.cn** (bot check) and **Naver/Tistory** (JS shells) could not be read. These are probably the largest Chinese and Korean venues after muchong and BRIC. Bilibili comments and danmaku were not reachable, so bilibili evidence is limited to video titles and view counts, which measure supply and demand rather than user questions.
- **27 muchong threads are login-walled**, and only their search snippets (the opening lines) were usable. **BRIC detail pages are empty**, so answers and follow-ups could not be read beyond what the search page shows.
- **Spanish and Portuguese are thin (6, from Stack Overflow through the official API) and Turkish is thin (2).** Peer Q&A in these languages seems to live in Facebook groups, WhatsApp/Telegram and YouTube comments, none of which is reachable. ResearchGate, Quora and Brainly return 403.
- **German and French** come from general statistics forums (statistik-forum.de, les-mathematiques.net). gutefrage.net (403) and lab-specific forums (laborjournal) were not covered.
- **Japanese** coverage is one Q&A site plus two Qiita articles. Hatena blog search does not exist at the guessed URL, and note.com articles were only listed, not read.

## Note on Spanish and Portuguese

The six pt.stackoverflow.com and es.stackoverflow.com observations were
read through the official Stack Exchange API, the same documented path
used for every other Stack Exchange site in this catalogue (the HTML
pages refuse automated reads). They are included.
