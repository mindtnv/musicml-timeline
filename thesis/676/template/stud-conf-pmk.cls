\NeedsTeXFormat{LaTeX2e}[1997/12/01]
\ProvidesClass{stud-conf-pmk}[2026/04/25 LaTeX class for Student Conference of Faculty of Applied Mathematics and Cybernetics]

\makeatletter
\def\inputfileencoding{utf8}
\newif\if@utput
\@utputfalse\relax
\DeclareOption{cp1251}{\def\inputfileencoding{cp1251}}
\DeclareOption{output}{\@utputtrue\relax}
\ProcessOptions\relax

\LoadClass[notitlepage,a5paper,twoside,final]{article}

\RequirePackage{amssymb}
\RequirePackage{amsmath}
\RequirePackage{amsthm}

\RequirePackage[\inputfileencoding]{inputenc}
\RequirePackage[T1,T2A]{fontenc}
\RequirePackage[russian,english]{babel}

\RequirePackage{ucs}
\RequirePackage{afterpage}
\RequirePackage{sectsty}
\RequirePackage{fancyhdr}
\RequirePackage{indentfirst}
\RequirePackage{textcase}
\RequirePackage[protrusion=true,expansion=true,kerning=true,tracking=true,final=true]{microtype}
\RequirePackage{enumitem}
\RequirePackage{flushend}
\RequirePackage{cite}
\RequirePackage{etoolbox}
\RequirePackage[pdftex]{graphicx}
\RequirePackage{tikz}
\RequirePackage{tocloft}
\RequirePackage{caption}
\RequirePackage{placeins}%\PassOptionsToPackage{hyphens}{url}
\RequirePackage[unicode,colorlinks,linkcolor=blue,urlcolor=blue,draft=false,breaklinks,bookmarksopen,pdflang=ru-RU]{hyperref}
\RequirePackage{xurl} % Package for long urls.


% Open files for article references and pages
\if@utput
	\newwrite\pagesfile
	\newwrite\namesfile
	\immediate\openout\pagesfile=pages.txt\relax
	\immediate\openout\namesfile=names.txt\relax
\fi

% Forbid subsection and subsubsection.
\def\subsection{\errmessage{'subsection' is forbidden}}
\def\subsubsection{\errmessage{'subsubsection' is forbidden}}

\hoffset=-1in
\oddsidemargin=25mm
\evensidemargin=15mm
\textwidth=108.5mm

\voffset=-1in
\topmargin=15mm
\headheight=6mm
\headsep=3mm
\footskip=15mm
\textheight=160mm

%%% fancyhdr

\fancypagestyle{article-body}{
	\renewcommand{\footrulewidth}{0pt}
	\renewcommand{\headrule}{%
	\hrule height 0.4mm\relax
	\vskip .3mm\relax
	\hrule height .2mm\relax
	}
	\fancyhf{}
	\fancyhead[LE,RO]{\thepage}
	\fancyhead[LO]{\makeatletter
		\mbox{\@ellipsis{%
			\selectlanguage{russian}\preparep@rtheader{\@title}}%
			{.9\textwidth}}%
		\makeatother}
	\fancyhead[RE]{\makeatletter
		\mbox{\@ellipsis{\selectlanguage{russian}%
			\@dountil{\@countauthor}{v}{\mbox{\preparep@rtheader{\csname @shortauthor\v\endcsname}}}{, }}%
			{.9\textwidth}}%
		\makeatother}
	\fancyfoot[LO]{\makeatletter
		\mbox{\raise 2ex \hbox{\copyright\ \@ellipsis{\selectlanguage{russian}%
			\@dountil{\@countauthor}{v}{\mbox{\preparep@rtheader{\csname @shortauthor\v\endcsname}}}{, }}%
			{.7\textwidth}}}%
		\makeatother}
	\fancyfoot[RO]{\makeatletter
		\mbox{\wr@tvsushield}%
		\makeatother}
	\fancyfoot[LE]{\makeatletter
			\mbox{\raise 2ex \hbox{\@ellipsis{%
				\selectlanguage{russian}%
				\slshape\wr@fullconfname} %. \wr@sbornik.}%
				%\slshape\wr@confdecl. \wr@sbornik}%
				{.9\textwidth}}}%
			\makeatother}
}

\fancypagestyle{article-rustitle}{
	\renewcommand{\headrulewidth}{0.1pt}
	\fancyhf{}
	\fancyhead[LE,RO]{\thepage}
	\fancyhead[LO,RE]{\makeatletter
		\mbox{\@ellipsis{%
			\selectlanguage{russian}%
			\slshape\wr@confdecl. \wr@sbornik}%
			{.9\textwidth}}%
		\makeatother}
	\renewcommand{\footrule}{}
	\fancyfoot[LO,LE]{\makeatletter
		\mbox{\raise 2ex \hbox{\copyright\ \@ellipsis{\selectlanguage{russian}%
			\@dountil{\@countauthor}{v}{\mbox{\preparep@rtheader{\csname @shortauthor\v\endcsname}}}{, }}%
			{.7\textwidth}}}%
		\makeatother}
	\fancyfoot[RO,RE]{\makeatletter
		\mbox{\wr@tvsushield}%
		\makeatother}
}

\fancypagestyle{content-rus}{
	\renewcommand{\headrulewidth}{0.1pt}
	\fancyhf{}
	\fancyhead[LE,RO]{\thepage}
	\fancyhead[LO,RE]{\makeatletter
		\mbox{\@ellipsis{%
			\selectlanguage{russian}%
			\slshape\wr@confdecl. \wr@sbornik}%
			{.9\textwidth}}%
		\makeatother}
	\renewcommand{\footrule}{}
	\fancyfoot[LO,LE]{}
	\fancyfoot[RO,RE]{\makeatletter
		\mbox{\wr@tvsushield}%
		\makeatother}
}

\pagestyle{article-body}
\fancypagestyle{plain}{}

%%%  Tables of Contents

\newlistof{ruspapers}{rtoc}{\wr@contents}

\def\l@section#1#2{\vbox{\raggedright#1\hbox{\hspace*{4em}}\hskip-4em\dotfill#2\par}\vskip1ex}
\def\cftsecfont{}
\def\cftsecleader{\dotfill}
\def\cftsecpagefont{}
\cftsetindents{section}{0em}{0em}

\def\tableofruscontents{%
    \pagestyle{content-rus}%
	\selectlanguage{russian}
	\def\cftrtoctitlefont{\p@rtheader}%
	\cftafterrtoctitleskip=10ex%
	\listofruspapers
	\newpage
	\pagestyle{article-body}%
}

%%% Local Refs
\let\@ldcite\cite
\AtBeginDocument{%
\let\@ldref\ref
\let\@ldlabel\label
\def\ref#1{\expandafter\@ldref\expandafter{\the\@countpaper-paper:#1}}
\def\label#1{\expandafter\@ldlabel\expandafter{\the\@countpaper-paper:#1}}
\let\ltx@label\label}

\let\@ldtheHsection\theHsection
\def\theHsection{%
\the\@countpaper-\@ldtheHsection%
}

%\def\@clquit\end{\expandafter\@ldcite\expandafter{\@cl}}
\def\@clquit\end{}
\def\delsp@ce#1{#1}
\def\m@k@cl{\ifx\va@next\end\let\@@next\@clquit\else\let\@@next\m@kecl\fi\expandafter\@@next\delsp@ce}
\def\m@k@@@{\futurelet\va@next\m@k@cl}
\def\m@kecl#1,{\edef\@cl{\@cl\@cldelim\the\@countpaper-paper-\@citelang:#1}%
		\def\@cldelim{,}\m@k@@@}
% Modified \cite with support of optional argument.
\def\cit@@@{\ifx[\va@next\let\va@next\cit@\else\let\va@next\cit@@\fi\va@next}
\def\cit@[#1]#2{\def\@cl{}\def\@cldelim{}\expandafter\m@kecl\delsp@ce#2,\end\expandafter\@ldcite[#1]{\expandafter{\@cl}}}
\def\cit@@#1{\def\@cl{}\def\@cldelim{}\expandafter\m@kecl\delsp@ce#1,\end\expandafter\@ldcite\expandafter{\@cl}}
\def\cite{\futurelet\va@next\cit@@@}
%\def\cite#1{\def\@cl{}\def\@cldelim{}\expandafter\m@kecl\delsp@ce#1,\end}


\def\@uthor[#1]#2{
\@@shortauthor#1\quit\relax
\@@author#2\quit\relax
}
\def\@@uthor#1{\@uthor[#1]{#1}}
\def\@@@author{%
\if[\va@next\let\va@next\@uthor\else\let\va@next\@@uthor\fi\va@next
}
\def\author{%
\advance\@countauthor by 1\relax
\futurelet\va@next\@@@author%
}

%%% Words
\def\wr@tvguname{\cyr\CYRT\cyr\cyrv\cyr\cyre\cyr\cyrr\cyr\cyrs\cyr\cyrk\cyr\cyro\cyr\cyrishrt\space\cyr\cyrg\cyr\cyro\cyr\cyrs\cyr\cyru\cyr\cyrd\cyr\cyra\cyr\cyrr\cyr\cyrs\cyr\cyrt\cyr\cyrv\cyr\cyre\cyr\cyrn\cyr\cyrn\cyr\cyrery\cyr\cyrishrt\space\cyr\cyru\cyr\cyrn\cyr\cyri\cyr\cyrv\cyr\cyre\cyr\cyrr\cyr\cyrs\cyr\cyri\cyr\cyrt\cyr\cyre\cyr\cyrt}
\def\wr@speciality{\cyr\CYRN\cyr\cyra\cyr\cyrp\cyr\cyrr\cyr\cyra\cyr\cyrv\cyr\cyrl\cyr\cyre\cyr\cyrn\cyr\cyri\cyr\cyre}
%\def\wr@bachelor{\cyr\CYRS\cyr\cyrt\cyr\cyru\cyr\cyrd\cyr\cyre\cyr\cyrn\cyr\cyrt\space\cyr\cyrb\cyr\cyra\cyr\cyrk\cyr\cyra\cyr\cyrl\cyr\cyra\cyr\cyrv\cyr\cyrr\cyr\cyri\cyr\cyra\cyr\cyrt\cyr\cyra}
%\def\wr@master{\cyr\CYRS\cyr\cyrt\cyr\cyru\cyr\cyrd\cyr\cyre\cyr\cyrn\cyr\cyrt\space\cyr\cyrm\cyr\cyra\cyr\cyrg\cyr\cyri\cyr\cyrs\cyr\cyrt\cyr\cyrr\cyr\cyra\cyr\cyrt\cyr\cyru\cyr\cyrr\cyr\cyrery}
\def\wr@introduction{\cyr\CYRV\cyr\cyrv\cyr\cyre\cyr\cyrd\cyr\cyre\cyr\cyrn\cyr\cyri\cyr\cyre}
\def\wr@conclusion{\cyr\CYRZ\cyr\cyra\cyr\cyrk\cyr\cyrl\cyr\cyryu\cyr\cyrch\cyr\cyre\cyr\cyrn\cyr\cyri\cyr\cyre}
\def\wr@briefconfname{\cyr\CYRM\cyr\cyra\cyr\cyrt\cyr\cyre\cyr\cyrm\cyr\cyra\cyr\cyrt\cyr\cyri\cyr\cyrch\cyr\cyre\cyr\cyrs\cyr\cyrk\cyr\cyri\cyr\cyre\space\cyr\cyro\cyr\cyrs\cyr\cyrn\cyr\cyro\cyr\cyrv\cyr\cyrery\space\cyr\cyri\cyr\cyrn\cyr\cyrf\cyr\cyro\cyr\cyrr\cyr\cyrm\cyr\cyra\cyr\cyrt\cyr\cyri\cyr\cyrk\cyr\cyri\space\cyr\cyri\space\cyr\cyri\cyr\cyrn\cyr\cyrf\cyr\cyro\cyr\cyrr\cyr\cyrm\cyr\cyra\cyr\cyrc\cyr\cyri\cyr\cyro\cyr\cyrn\cyr\cyrn\cyr\cyro\nobreak-\hskip0pt\relax\cyr\cyrk\cyr\cyro\cyr\cyrm\cyr\cyrm\cyr\cyru\cyr\cyrn\cyr\cyri\cyr\cyrk\cyr\cyra\cyr\cyrc\cyr\cyri\cyr\cyro\cyr\cyrn\cyr\cyrn\cyr\cyrery\cyr\cyrh\space\cyr\cyrs\cyr\cyri\cyr\cyrs\cyr\cyrt\cyr\cyre\cyr\cyrm}
%\cyr\cyrt\cyr\cyre\cyr\cyrh\cyr\cyrn\cyr\cyro\cyr\cyrl\cyr\cyro\cyr\cyrg\cyr\cyri\cyr\cyrishrt
%\def\wr@confdecl{\cyr\CYRV\cyr\cyrs\cyr\cyre\cyr\cyrr\cyr\cyro\cyr\cyrs\cyr\cyrs\cyr\cyri\cyr\cyrishrt\cyr\cyrs\cyr\cyrk\cyr\cyra\cyr\cyrya\space\cyr\cyrn\cyr\cyra\cyr\cyru\cyr\cyrch\cyr\cyrn\cyr\cyra\cyr\cyrya\space\cyr\cyrk\cyr\cyro\cyr\cyrn\cyr\cyrf\cyr\cyre\cyr\cyrr\cyr\cyre\cyr\cyrn\cyr\cyrc\cyr\cyri\cyr\cyrya}
\def\wr@confdecl{\cyr\CYRS\cyr\cyrt\cyr\cyru\cyr\cyrd\cyr\cyre\cyr\cyrn\cyr\cyrch\cyr\cyre\cyr\cyrs\cyr\cyrk\cyr\cyra\cyr\cyrya\space\cyr\cyrk\cyr\cyro\cyr\cyrn\cyr\cyrf\cyr\cyre\cyr\cyrr\cyr\cyre\cyr\cyrn\cyr\cyrc\cyr\cyri\cyr\cyrya}
%\def\wr@fullconfname{\wr@confdecl\space<<\wr@briefconfname>>}
\def\wr@fullconfname{\cyr\CYRS\cyr\cyrt\cyr\cyru\cyr\cyrd\cyr\cyre\cyr\cyrn\cyr\cyrch\cyr\cyre\cyr\cyrs\cyr\cyrk\cyr\cyra\cyr\cyrya\space\cyr\cyrk\cyr\cyro\cyr\cyrn\cyr\cyrf\cyr\cyre\cyr\cyrr\cyr\cyre\cyr\cyrn\cyr\cyrc\cyr\cyri\cyr\cyrya\space\cyr\cyrf\cyr\cyra\cyr\cyrk\cyr\cyru\cyr\cyrl\cyr\cyrsftsn\cyr\cyrt\cyr\cyre\cyr\cyrt\cyr\cyra\space\cyr\CYRP\cyr\CYRM\cyr\cyri\cyr\CYRK}
%\def\wr@sbornik{\cyr\CYRS\cyr\cyrb\cyr\cyro\cyr\cyrr\cyr\cyrn\cyr\cyri\cyr\cyrk\space\cyr\cyrt\cyr\cyrr\cyr\cyru\cyr\cyrd\cyr\cyro\cyr\cyrv}
\def\wr@sbornik{\cyr\CYRS\cyr\cyrb\cyr\cyro\cyr\cyrr\cyr\cyrn\cyr\cyri\cyr\cyrk\space\cyr\cyrt\cyr\cyrr\cyr\cyru\cyr\cyrd\cyr\cyro\cyr\cyrv}
\def\wr@tvertversu{\cyr\CYRT\cyr\cyrv\cyr\cyre\cyr\cyrr\cyr\cyr\cyrsftsn~: \cyr\CYRT\cyr\cyrv\cyr\CYRG\cyr\CYRU}
\def\wr@vestnik{\cyr\CYRV\cyr\cyre\cyr\cyrs\cyr\cyrt\cyr\cyrn\cyr\cyri\cyr\cyrk\space \cyr\CYRT\cyr\cyrv\cyr\CYRG\cyr\CYRU}
%\def\wr@tvsushield{\IfFileExists{tvsu-mono.pdf}{\includegraphics[height=5ex]{tvsu-mono.pdf}}{}}
\def\wr@tvsushield{\copy\wr@tvsutikzshield}
\def\wr@seriya{\cyr\CYRS\cyr\cyre\cyr\cyrr\cyr\cyri\cyr\cyrya: \cyr\CYRP\cyr\cyr\cyrr\cyri\cyr\cyrk\cyr\cyrl\cyr\cyra\cyr\cyrd\cyr\cyrn\cyr\cyra\cyr\cyrya\space
\cyr\cyrm\cyr\cyra\cyr\cyrt\cyr\cyre\cyr\cyrm\cyr\cyra\cyr\cyrt\cyr\cyri\cyr\cyrk\cyr\cyra}
\def\wr@no{\textnumero}
\def\wr@pages{\cyr\CYRS.}
\def\wr@authors{\cyr\CYRS\cyr\cyrv\cyr\cyre\cyr\cyrd\cyr\cyre\cyr\cyrn\cyr\cyri\cyr\cyrya\space
\cyr\cyro\cyr\cyrb\space
\cyr\cyra\cyr\cyrv\cyr\cyrt\cyr\cyro\cyr\cyrr\cyr\cyra\cyr\cyrh}
\def\wr@citation{\cyr\CYRB\cyr\cyri\cyr\cyrb\cyr\cyrl\cyr\cyri\cyr\cyro\cyr\cyrg\cyr\cyrr\cyr\cyra\cyr\cyrf\cyr\cyri\cyr\cyrch\cyr\cyre\cyr\cyrs\cyr\cyrk\cyr\cyra\cyr\cyrya\space
\cyr\cyrs\cyr\cyrs\cyr\cyrery\cyr\cyrl\cyr\cyrk\cyr\cyra}
\def\wr@references{\cyr\CYRS\cyr\cyrp\cyr\cyri\cyr\cyrs\cyr\cyro\cyr\cyrk\space
\cyr\cyrl\cyr\cyri\cyr\cyrt\cyr\cyre\cyr\cyrr\cyr\cyra\cyr\cyrt\cyr\cyru\cyr\cyrr\cyr\cyrery}
\def\wr@abstract{\cyr\CYRA\cyr\cyrn\cyr\cyrn\cyr\cyro\cyr\cyrt\cyr\cyra\cyr\cyrc\cyr\cyri\cyr\cyrya}
\def\wr@keywords{\cyr\CYRK\cyr\cyrl\cyr\cyryu\cyr\cyrch\cyr\cyre\cyr\cyrv\cyr\cyrery\cyr\cyre\space
\cyr\cyrs\cyr\cyrl\cyr\cyro\cyr\cyrv\cyr\cyra}
\def\wr@received{\cyr\CYRP\cyr\cyro\cyr\cyrs\cyr\cyrt\cyr\cyru\cyr\cyrp\cyr\cyri\cyr\cyrl\cyr\cyro\space
\cyr\cyrv\space
\cyr\cyrr\cyr\cyre\cyr\cyrd\cyr\cyra\cyr\cyrk\cyr\cyrc\cyr\cyri\cyr\cyryu}
\def\wr@revised{\cyr\CYRP\cyr\cyro\cyr\cyrs\cyr\cyrl\cyr\cyre\space
\cyr\cyrp\cyr\cyre\cyr\cyrr\cyr\cyre\cyr\cyrr\cyr\cyra\cyr\cyrb\cyr\cyro\cyr\cyrt\cyr\cyrk\cyr\cyri}
\def\wr@UDC{\cyr\CYRU\cyr\CYRD\cyr\CYRK}
\def\wr@contents{\cyr\CYRS\cyr\cyro\cyr\cyrd\cyr\cyre\cyr\cyrr\cyr\cyrzh\cyr\cyra\cyr\cyrn\cyr\cyri\cyr\cyre}

\def\wr@theorem{\cyr\CYRT\cyr\cyre\cyr\cyro\cyr\cyrr\cyr\cyre\cyr\cyrm\cyr\cyra}
\def\wr@lemma{\cyr\CYRL\cyr\cyre\cyr\cyrm\cyr\cyrm\cyr\cyra}
\def\wr@proposition{\cyr\CYRP\cyr\cyrr\cyr\cyre\cyr\cyrd\cyr\cyrl\cyr\cyro\cyr\cyrzh\cyr\cyre\cyr\cyrn\cyr\cyri\cyr\cyre}
\def\wr@definition{\cyr\CYRO\cyr\cyrp\cyr\cyrr\cyr\cyre\cyr\cyrd\cyr\cyre\cyr\cyrl\cyr\cyre\cyr\cyrn\cyr\cyri\cyr\cyre}
\def\wr@example{\cyr\CYRP\cyr\cyrr\cyr\cyri\cyr\cyrm\cyr\cyre\cyr\cyrr}
\def\wr@remark{\cyr\CYRZ\cyr\cyra\cyr\cyrm\cyr\cyre\cyr\cyrch\cyr\cyra\cyr\cyrn\cyr\cyri\cyr\cyre}
\def\wr@claim{\cyr\CYRU\cyr\cyrt\cyr\cyrv\cyr\cyre\cyr\cyrr\cyr\cyrzh\cyr\cyrd\cyr\cyre\cyr\cyrn\cyr\cyri\cyr\cyre}
\def\wr@corollary{\cyr\CYRS\cyr\cyrl\cyr\cyre\cyr\cyrd\cyr\cyrs\cyr\cyrt\cyr\cyrv\cyr\cyri\cyr\cyre}

\def\we@AMSMSC{AMS MSC2020}
\def\we@DOI{DOI}
\def\we@email{E-mail}


%%% microtype emphasis

\def\resetls{\makeatletter\let\glb@currsize\@empty\makeatother}
\def\em{\tracking\aftergroup\resetls\everymath={\nolsmath}}

\def\so#1{{\em #1}}
\let\emph\so
\def\nolsmath{\relax$\everymath={}\notracking$\aftergroup\endnolsmath}
\def\endnolsmath{\everymath={\nolsmath}\tracking}

\def\settracking#1{\let\MT@ls@adjust@\relax\MT@ls@set@ls{#1}\lsstyle}
\def\tracking{\settracking{200}}
\def\notracking{\settracking{0}}

%%% sectsty

\def\@headerbox#1{\parbox{.8\textwidth}{\bfseries\normalsize\raggedright#1}}
\allsectionsfont{\bfseries\normalsize\raggedright\noindent\@headerbox}
%\def\@seccntformat#1{\hbox to 1.2em{\csname the#1\endcsname.}\relax}
\def\@seccntformat#1{\hbox{\csname the#1\endcsname.}\kern.5ex\relax}

\def\introduction{\section*{\wr@introduction}}
\def\conclusion{\section*{\wr@conclusion}}

%%% List setup

%\setlist[enumerate]{label={\upshape\mdseries\arabic{*})},itemsep=0ex}
\AddEnumerateCounter{\asbuk}{\@asbuk}{ж}
\setlist[enumerate,1]{label={\upshape\mdseries\arabic{*})},itemsep=0ex}
\setlist[enumerate,2]{label={\upshape\mdseries\asbuk{*})},itemsep=0ex}
\setlist[itemize,2]{label={$\circ$},itemsep=0ex}

%%% Title fonts

\def\preparep@rtheader#1{%\MakeTextUppercase
{#1}}

\def\p@rtheader#1{\Large\bfseries\upshape\rmfamily\preparep@rtheader{#1}}

%%% title

\newcount\@countauthor
\newcount\@countpaper
\newcount\@countaux

\@countauthor=0\relax
\@countpaper=0\relax

%\def\@@title#1\quit{%
%\selectlanguage{russian}\relax
%\def\@title{#1}\relax
%}
%\def\title#1{%
%\@errorifnorelax{\@title}{'Title' is already defined:}
%\expandafter\edef\csname @paperbeginpage\romannumeral\@countpaper\endcsname{\arabic{page}}
%\ifcsname @paperendpage\romannumeral\@countpaper\endcsname\else
%\expandafter\edef\csname @paperendpage\romannumeral\@countpaper\endcsname{???}
%\fi
%\@@title#1\quit\relax
%}

\def\@@title#1\quit{%
\selectlanguage{russian}\relax
\def\@title{#1}\relax
}
\def\@@@title[#1]#2{
\@@splittitle#1\quit\relax
\@@title#2\quit\relax
}
\def\@@@@title#1{\@@@title[#1]{#1}}
\def\@@@@@title{%
\if[\va@next\let\va@next\@@@title\else\let\va@next\@@@@title\fi\va@next
}
\def\title{%
\@errorifnorelax{\@title}{'Title' is already defined:}
\expandafter\edef\csname @paperbeginpage\romannumeral\@countpaper\endcsname{\arabic{page}}
\ifcsname @paperendpage\romannumeral\@countpaper\endcsname\else
\expandafter\edef\csname @paperendpage\romannumeral\@countpaper\endcsname{???}
\fi
\futurelet\va@next\@@@@@title%
}
\def\@@splittitle#1\quit{%
\selectlanguage{russian}\relax
\def\@splittitle{#1}\relax
}
\def\presented#1{%
\@@presented#1\quit\relax
}
\def\@@presented#1\quit{%
\@errorifnorelax{\@presented}{'Presented' is already defined:}
\expandafter\def\csname @presented\endcsname{#1}\relax
}

\def\@@support#1\quit{%
\def\@support{#1}\relax
}
\def\support#1{%
\@errorifnorelax{\@support}{'Support' is already defined:}
\@@support#1\quit\relax
}

\def\@@keywords#1\quit{%
\def\@keywords{#1}\relax
}
\def\keywords#1{%
\@errorifnorelax{\@keywords}{'Keywords' are already defined:}
\@@keywords#1\quit\relax
}

\long\def\@@abstract#1\quit{%
\long\def\@abstract{#1}\relax
}
\long\def\abstract#1{%
\@errorifnorelax{\@abstract}{'Abstract' is already defined:}
\@@abstract#1\quit\relax
}

\def\UDC#1{%
\@errorifnorelax{\@UDC}{'UDC' is already defined:}
\def\@UDC{#1}\relax
}

\def\AMSMSC#1{%
\@errorifnorelax{\@AMSMSC}{'AMS MSC' is already defined:}
\def\@AMSMSC{#1}\relax
}

\def\DOI#1{%
\@errorifnorelax{\@DOI}{'DOI' is already defined:}
\def\@DOI{#1}\relax
}

\def\@@author#1\quit{%
\expandafter\def\csname @author\romannumeral\@countauthor\endcsname{#1}\relax
}
\def\@@shortauthor#1\quit{%
\expandafter\def\csname @shortauthor\romannumeral\@countauthor\endcsname{#1}\relax
}
\def\@uthor[#1]#2{
\@@shortauthor#1\quit\relax
\@@author#2\quit\relax
}
\def\@@uthor#1{\@uthor[#1]{#1}}
\def\@@@author{%
\if[\va@next\let\va@next\@uthor\else\let\va@next\@@uthor\fi\va@next
}
\def\author{%
\advance\@countauthor by 1\relax
\futurelet\va@next\@@@author%
}

\newif\ifm@ltiinstitute

\def\@@institute#1\quit{%
\@errorifnorelaxnum{@institute}{\@countauthor}{'Institute' for author \the\@countauthor\space is already defined:}
\expandafter\def\csname @institute\romannumeral\@countauthor\endcsname{#1}\relax
}

\def\institute#1{%
\@@institute#1\quit\relax
\ifnum\@countauthor>1\relax
	\m@ltiinstitutetrue
	\@countaux=\@countauthor\relax
	\advance\@countaux by -1\relax
	\expandafter\expandafter\expandafter\expandafter\expandafter\expandafter\expandafter\edef
		\expandafter\expandafter\expandafter\expandafter\expandafter\expandafter
			\csname instituten@mber\romannumeral\@countauthor\endcsname
		\expandafter\expandafter\expandafter{%
		\csname instituten@mber\romannumeral\@countaux\endcsname*}%
\else
	\def\instituten@mberi{*}%
\fi
}

\def\sameinstitute{%
\ifnum\@countauthor<2\relax
	\errmessage{'Institute' for the first author can't be same.}\relax
\fi
\@errorifnorelaxnum{@institute}{\@countauthor}{'Institute' for author \the\@countauthor\space is already defined:}
\@countaux=\@countauthor\relax
\advance\@countaux by -1\relax
\expandafter\expandafter\expandafter\let
	\expandafter\expandafter\csname @institute\romannumeral\@countauthor\endcsname
	\csname @institute\romannumeral\@countaux\endcsname
	\relax
\expandafter\expandafter\expandafter\let
	\expandafter\expandafter\csname instituten@mber\romannumeral\@countauthor\endcsname
	\csname instituten@mber\romannumeral\@countaux\endcsname
	\relax
}

\def\@@speciality#1\quit{%
\@errorifnorelaxnum{@speciality}{\@countauthor}{'Speciality' for author \the\@countauthor\space is already defined:}
\expandafter\def\csname @speciality\romannumeral\@countauthor\endcsname{#1}\relax
}
\def\speciality#1{%
\@@speciality#1\quit\relax
}

\def\@@student#1\quit{%
\@errorifnorelaxnum{@student}{\@countauthor}{'Student' for author \the\@countauthor\space is already defined:}
\expandafter\def\csname @student\romannumeral\@countauthor\endcsname{#1}\relax
}
\def\student#1{%
\@@student#1\quit\relax
}

\def\@@address#1\quit{%
\@errorifnorelaxnum{@address}{\@countauthor}{'Address' for author \the\@countauthor\space is already defined:}
\expandafter\def\csname @address\romannumeral\@countauthor\endcsname{#1}\relax
}
\def\address#1{%
\@@address#1\quit\relax
}

\def\email#1{%
\@errorifnorelaxnum{@email}{\@countauthor}{'E-mail' for author \the\@countauthor\space is already defined:}
\expandafter\def\csname @email\romannumeral\@countauthor\endcsname{#1}\relax
}

\def\received#1{%
\def\@received{#1}\relax
\let\@revised\relax
}

\def\revised#1{%
\def\@revised{#1}\relax
}

\def\year#1{%
\def\@year{#1}\relax
}

\def\no#1{%
\def\@no{#1}\relax
}

%% utility

\long\def\@dountil#1#2#3#4{%
\ifnum#1<1\relax
\else
	\@countaux=#1\relax
	{%
	\advance\@countaux by -1\relax
	\@dountil{\@countaux}{#2}{#3}{#4}%
	}%
	\ifnum#1>1\relax
		#4%
	\fi
	\expandafter\edef\csname #2\endcsname{\romannumeral\@countaux}%
	#3%
\fi
}

\newbox\@headboxa
\newbox\@headboxb

\def\removeuntilvoid#1{%
\setbox\@headboxa\box\@headboxb
\unskip\unpenalty\unskip\setbox\@headboxb\lastbox
\ifvoid\@headboxb
	\hbox{\unhbox\@headboxa\space#1}%
\else
	\removeuntilvoid{\dots}%
\fi
}
\def\@ellipsis#1#2{%
\hbox{\vbox{\hsize=#2\relax
	\setbox\@headboxb\hbox{ \dots}%
	\advance\hsize by -\wd\@headboxb\relax%
	\raggedright#1\par\unskip\unpenalty\unskip\setbox\@headboxb\lastbox\removeuntilvoid{}}}%
}

\def\@linedbox#1{%
\setbox\@headboxa\hbox{\kern0.5em\relax#1\kern0.5em\relax}%
 \begin{minipage}{\wd\@headboxa}
  \hrule
  \vskip1.5ex
 \centering\itshape\small\leavevmode\box\@headboxa
  \vskip1.5ex
  \hrule
 \end{minipage}%
}

%%% Citation

\def\@ruscitejournal#1{{#1\relax \wr@fullconfname. \wr@sbornik.~--- \wr@tvertversu, }%
 \@coalesce{\@year}{????}}

\def\@citep@ges{\csname @paperbeginpage\romannumeral\@countpaper\endcsname--\csname @paperendpage\romannumeral\@countpaper\endcsname}

\def\@ruscite#1{%
 \@ruscitejournal{}.~---
 \wr@pages\,\@citep@ges.}

%%% Remove \, from bookmarks.
\pdfstringdefDisableCommands{%
	\def\,{\space}
}

%% russian title page

\def\c@tto#1#2{%
\expandafter\expandafter\expandafter\gdef
\expandafter\expandafter\expandafter#1%
\expandafter\expandafter\expandafter{%
\expandafter#1#2}}

\def\makerussiantitle{%
\selectlanguage{russian}%
\makeatletter
\def\@citelang{ru}%
\thispagestyle{article-rustitle}
\xdef\@listofauthors{}%
\xdef\@listofauthorsdelim{}%
\@dountil{\@countauthor}{v}{%
\c@tto{\@listofauthors}{\@listofauthorsdelim}%
\c@tto{\@listofauthors}{\csname @shortauthor\v\endcsname}%
\xdef\@listofauthorsdelim{, }%
}{}

\noindent
\@errorifrelax{\@UDC}{There is no UDC for a paper:}%
\wr@UDC{} \@UDC\par
%\noindent
%\@errorifrelax{\@AMSMSC}{There is no AMS MSC for a paper:}%
%\we@AMSMSC: \@AMSMSC\relax
\par


\vskip1ex
\begin{center}
\@errorifrelax{\@title}{There is no title for a paper \the\@countpaper}

% Add bookmark to pdf file.
\pdfbookmark[1]{\@listofauthors\ \@title}{p@per\the\@countpaper}


 {\titlelinespread%\large\bfseries\MakeTextUppercase{\@title}%
 %\p@rtheader{\@title}%
 \p@rtheader{\@splittitle}
 \gdef\@footnotesupport{}%
 \@ifnorelax{\@support}{\footnotemark\gdef\@footnotesupport{\footnotetext{\@support}}}\par}
\phantomsection
\addcontentsline{rtoc}{section}{\itshape\@listofauthors\newline\upshape\@title}

% \vskip1ex
\ifm@ltiinstitute
	\vskip2ex
	{\bfseries 
	\@dountil{\@countauthor}{v}{%
	 \csname @shortauthor\v\endcsname${}^{\csname instituten@mber\v\endcsname}$%
	 }{, }%
	 }\par
	 \vskip1ex
	\@dountil{\@countauthor}{v}{%
		\def\t@mp{i}%
		\ifx\v\t@mp\relax
			\xdef\pr@vinstitute{\csname instituten@mber\v\endcsname}%
  			 ${}^{\csname instituten@mber\v\endcsname}$%
			 \csname @institute\v\endcsname\par
		\else
			\expandafter\ifx\csname instituten@mber\v\endcsname\pr@vinstitute
			\else
				\xdef\pr@vinstitute{\csname instituten@mber\v\endcsname}%
	  			 ${}^{\csname instituten@mber\v\endcsname}$%
				 \csname @institute\v\endcsname\par
			\fi
		\fi
	 }{}%
%	 {\csname @institutei\endcsname\par}
\else
	\vskip2ex
	{\bfseries 
	\@dountil{\@countauthor}{v}{%
	 \csname @shortauthor\v\endcsname
	 }{, }%
	 }\par
	 %\vskip1ex
	 %{\csname @institutei\endcsname\par}
\fi
 
% Default institute: TvGU
\vskip1ex
\wr@tvguname

% Presented by scientific supervisor.
\@errorifrelax{\@presented}{There is no supervisor for a paper \the\@countpaper}
{\small\@presented}

\@errorifrelax{\@keywords}{There are no keywords for a paper:}
\@errorifrelax{\@abstract}{There is no abstract for a paper:}
 \vskip3ex
 \begin{minipage}{.9\textwidth}
 \small
 \noindent
 {\parheadstyle\parheadtracking \wr@abstract.}
 \@abstract
 \par
% \vskip2ex
% \noindent
 {\parheadstyle\parheadtracking \wr@keywords:} \@keywords.
 \end{minipage}
 \end{center}
\@footnotesupport
\thispagestyle{article-rustitle}
% Do not include bookmarks for section, subsections etc.
\hypersetup{bookmarksdepth=-1}
\makeatother
}

%% Revert name parts

\def\briefn@mefi@#1 #2\quit{%
	\def\@mpty{}\def\@mpt@{#2}%
	\ifx\@mpt@\@mpty
		#1\,\f@m%
	\else
		\expandafter\expandafter\expandafter\def
			\expandafter\expandafter\expandafter\f@m
			\expandafter\expandafter\expandafter{%
			\expandafter\f@m
			\d@lim#1}%
		\def\d@lim{\space}%
		\briefn@mefi@#2\quit
	\fi
}
\def\briefn@meiof#1{\def\f@m{}\def\d@lim{}\briefn@mefi@#1 \quit}

\def\briefn@mefci@#1 #2\quit{%
	\def\@mpty{}\def\@mpt@{#2}%
	\ifx\@mpt@\@mpty
		\f@m,~#1%
	\else
		\expandafter\expandafter\expandafter\def
			\expandafter\expandafter\expandafter\f@m
			\expandafter\expandafter\expandafter{%
			\expandafter\f@m
			\d@lim#1}%
		\def\d@lim{\space}%
		\briefn@mefci@#2\quit
	\fi
}
\def\briefn@mefcio#1{\def\f@m{}\def\d@lim{}\briefn@mefci@#1 \quit}

% Replace \, with usual spaces.
\def\p@tsp@ces#1\,#2\quit{%
	\def\empty{}\def\empt@{#2}
	\c@tto{\initi@ls}{\d@l@m}
	\c@tto{\initi@ls}{\noexpand#1}
	\ifx\empty\empt@
	\else
		\def\d@l@m{\space}
		\p@tsp@ces#2\quit
	\fi
}
\def\putsp@ces#1{\def\n@me{}\def\d@l@m{}\p@tsp@ces#1\,\quit}

% Get "iof" into \initi@ls.
\def\@briefn@mefi@#1 #2\quit{%
	\def\@mpty{}\def\@mpt@{#2}%
	\ifx\@mpt@\@mpty
		\def\initi@ls{}
		\putsp@ces{#1}
		\c@tto{\initi@ls}{\space}
		\c@tto{\initi@ls}{\f@m}
	\else
		\c@tto{\f@m}{\d@lim#1}
		\def\d@lim{\space}%
		\@briefn@mefi@#2\quit
	\fi
}
\def\@briefn@meiof#1{\def\f@m{}\def\initi@ls{}\def\d@lim{}\@briefn@mefi@#1 \quit}

% Get "f,io" into \f@m.
\def\@briefn@mefci@#1 #2\quit{%
	\def\@mpty{}\def\@mpt@{#2}%
	\ifx\@mpt@\@mpty
		\def\initi@ls{}
		\putsp@ces{#1}
		\c@tto{\f@m}{, }
		\c@tto{\f@m}{\initi@ls}
	\else
		\c@tto{\f@m}{\d@lim#1}
		\def\d@lim{\space}%
		\@briefn@mefci@#2\quit
	\fi
}
\def\@briefn@mefcio#1{\def\f@m{}\def\initi@ls{}\def\d@lim{}\@briefn@mefci@#1 \quit}

%% russian final page

\def\makerussianfinal{%
\selectlanguage{russian}%
\makeatletter
\let\bibitem\rusbibitem
%\renewcommand\refname{\wr@references}
\begin{oldbibliography}\b@bwidth
\itemsep=.7ex\relax
\parskip=0mm\relax
\bibb@dy
\end{oldbibliography}
 \vskip4ex

\section*{\wr@citation}
 
% \vskip2ex
 \noindent
% \@dountil{\@countauthor}{v}{\csname @shortauthor\v\endcsname}{, }
%\@errorifrelax{\@title}{There is no russian title for a paper  \the\@countpaper}
% \@title{} //
% \@ruscite{\relax}
\ifnum\@countauthor<4\relax%
   {\itshape \expandafter\expandafter\expandafter\briefn@mefcio
   	   		\expandafter\expandafter\expandafter{\csname @shortauthori\endcsname}}
 \fi
 \@errorifrelax{\@title}{There is no title for a paper  \the\@countpaper}%
 \@title{}%
 \ifnum\@countauthor>1\relax%
	 \ifnum\@countauthor<5\relax%
	   ~/ \@dountil{\@countauthor}{v}{%
	   		\expandafter\expandafter\expandafter\briefn@meiof
	   		\expandafter\expandafter\expandafter{\csname @shortauthor\v\endcsname}%
	   		}{, }~//
	 \else
	   ~/ \@dountil{3}{v}{%
	   		\expandafter\expandafter\expandafter\briefn@meiof
	   		\expandafter\expandafter\expandafter{\csname @shortauthor\v\endcsname}%
	   		}{, } [et al.]~//
	 \fi
 \else
   ~//
 \fi
 \@ruscite{\relax}
%\\ https://doi.org/10.26456/mfcsics-21-\the\@countpaper
 
% Output to files.
\if@utput
	\def\@rtn@me{}

	\ifnum\@countauthor<4\relax%
		\expandafter\@briefn@mefcio\expandafter{\@shortauthori}
		\c@tto{\@rtn@me}{\f@m}
		\c@tto{\@rtn@me}{\space}
	\fi
	\c@tto{\@rtn@me}{\@title}
	\ifnum\@countauthor>1\relax%
		\c@tto{\@rtn@me}{ / }
		\ifnum\@countauthor<5\relax%
			\@dountil{\@countauthor}{v}{%
				\expandafter\expandafter\expandafter\@briefn@meiof\expandafter\expandafter\expandafter{\csname @shortauthor\v\endcsname}
				\c@tto{\@rtn@me}{\initi@ls}
			}
			{%
				\c@tto{\@rtn@me}{, }
			}
			\c@tto{\@rtn@me}{ //}
		\else
				\@dountil{3}{v}{%
				\expandafter\expandafter\expandafter\@briefn@meiof\expandafter\expandafter\expandafter{\csname @shortauthor\v\endcsname}
				\c@tto{\@rtn@me}{\initi@ls}
			}
			{%
				\c@tto{\@rtn@me}{, }
			}
			\c@tto{\@rtn@me}{ [et al.] //}
		\fi
	\else
		\c@tto{\@rtn@me}{ //}
	\fi

	\c@tto{\@rtn@me}{\space Студенческая конференция факультета ПМиК. Сборник трудов. — Тверь: ТвГУ, \@coalesce{\@year}{????}. — С. \csname @paperbeginpage\romannumeral\@countpaper\endcsname–\csname @paperendpage\romannumeral\@countpaper\endcsname.}

	\immediate\write\pagesfile{\csname @paperbeginpage\romannumeral\@countpaper\endcsname-\csname @paperendpage\romannumeral\@countpaper\endcsname}
	\immediate\write\namesfile{\@rtn@me}
	\immediate\write\namesfile{}
\fi

 \vskip4ex

\section*{\wr@authors}

% \vskip2ex
\ifnum\@countauthor>1
 \begin{enumerate}[label={\upshape\mdseries\arabic{*}.},itemsep=0ex]
  \@dountil{\@countauthor}{v}{\item {\parheadstyle%\parheadtracking
  						\notracking
  						\csname @author\v\endcsname}\\
						%\@errorifrelaxc{@institute}{\v}{There is no russian institute for author (\v):}%
						\@errorifrelaxc{@speciality}{\v}{There is no speciality for author (\v):}%
						\@errorifrelaxc{@student}{\v}{There is no student for author (\v):}%
						\csname @student\v\endcsname\\
						\wr@speciality\ <<\csname @speciality\v\endcsname>>\vskip.5ex
						%\@errorifrelaxc{@address}{\v}{There is no russian address for author (\v):}%
						%{\itshape\@ifnorelaxc{@address}{\v}{\csname @address\v\endcsname\\}%
						%\@errorifrelaxc{@email}{\v}{There is no e-mail for author (\v):}%
						%\we@email: \csname @email\v\endcsname}%
						}{}
 \end{enumerate}
\else
  						\noindent{\parheadstyle\parheadtracking\csname @author\v\endcsname}\\
						%\@errorifrelaxc{@institute}{\v}{There is no russian institute for author (\v):}%
						\@errorifrelaxc{@speciality}{\v}{There is no speciality for author (\v):}%
						\@errorifrelaxc{@student}{\v}{There is no student for author (\v):}%
						\csname @student\v\endcsname\\
						\wr@speciality\ <<\csname @speciality\v\endcsname>>
						%\@ifnorelaxc{@student}{\v}{. \csname @student\v\endcsname}\vskip1ex
						%\noindent
						%\@errorifrelaxc{@address}{\v}{There is no russian address for author (\v):}%
						%{\itshape\@ifnorelaxc{@address}{\v}{\csname @address\v\endcsname\\}%
						%\@errorifrelaxc{@email}{\v}{There is no e-mail for author (\v):}%
						%\we@email: \csname @email\v\endcsname}%
%						}{}
\fi
 \immediate\write\@auxout{\string\xdef\string\@paperendpage\romannumeral\@countpaper{\thepage}}%
\makeatother
}

\def\@errorifrelax#1#2{\ifx#1\relax\errmessage{#2}\stop\fi}
\def\@errorifrelaxc#1#2#3{\expandafter\ifx\csname#1#2\endcsname\relax\errmessage{#3}\stop\else\fi}
\def\@warnifrelax#1#2{\ifx#1\relax\message{#2}\fi}
\def\@errorifnorelax#1#2{\ifx#1\relax\else\errmessage{#2}\stop\fi}
\def\@errorifnorelaxnum#1#2#3{\expandafter\ifx\csname#1\romannumeral#2\endcsname\relax\else\errmessage{#3}\stop\fi}
\def\@ifnorelax#1#2{\ifx#1\relax\else#2\fi}
\long\def\@ifnorelaxc#1#2#3{\expandafter\ifx\csname#1#2\endcsname\relax\else#3\fi}
\def\@coalesce#1#2{\ifx#1\relax#2\else#1\fi}
\long\def\@ifnorelaxcc#1#2#3#4{\expandafter\ifx\csname#1#2\endcsname\relax#3\else#4\fi}

\def\newpaper{%
\let\@title\relax
\let\@support\relax
\let\@keywords\relax
\let\@abstract\relax
\let\@speciality\relax
\let\@splittitle\relax
\let\@presented\relax

\let\@UDC\relax
\let\@AMSMSC\relax
\let\@DOI\relax
\let\@received\relax
\let\@revised\relax

\@dountil{\@countauthor}{v}{%
\expandafter\let\csname @author\v\endcsname\relax
\expandafter\let\csname @shortauthor\v\endcsname\relax
\expandafter\let\csname @institute\v\endcsname\relax
\expandafter\let\csname @student\v\endcsname\relax
\expandafter\let\csname @address\v\endcsname\relax
\expandafter\let\csname @email\v\endcsname\relax
\expandafter\let\csname @speciality\v\endcsname\relax
}{}

\@countauthor=0\relax
\m@ltiinstitutefalse\relax
\global\advance\@countpaper by 1\relax
\setcounter{section}{0}
\setcounter{footnote}{0}
\setcounter{figure}{0}
\setcounter{table}{0}
\setcounter{theorem}{0}
\setcounter{definition}{0}
\setcounter{example}{0}
\setcounter{remark}{0}
\setcounter{equation}{0}
}

\def\titlelinespread{\linespread{1.1}}
\def\parheadtracking{\settracking{30}}
\def\parheadstyle{\scshape}

%%%

%\linespread{1.05}
\patchcmd\set@fontsize%
  {\baselineskip\f@baselineskip\relax}%
  {\baselineskip\f@baselineskip plus .06ex minus .02ex\relax
  }%
  {}{}%

%% Bibliography environment

\let\oldbibliography\thebibliography
\let\endoldbibliography\endthebibliography
\long\def\thebibliography#1#2\end#3{\end{#3}\gdef\b@bwidth{#1}\gdef\bibb@dy{#2\bibitem}}

\newbox\bibitembox@
\let\@ldbibitem\bibitem

\long\def\r@@bibitem#1#2\bibitem{%
\expandafter\@ldbibitem\expandafter{\the\@countpaper-paper-ru:#1}
#2
\rusbibitem}
\def\r@sbibitem{\ifx\va@next\end\let\va@next\relax\else\let\va@next\r@@bibitem\fi\va@next}
\def\rusbibitem{\futurelet\va@next\r@sbibitem}

%% Theorems environments

\newtheoremstyle{claim}% name
  {0.3ex}%      Space above, empty = `usual value'
  {0.3ex}%      Space below
  {\slshape}% Body font
  {}%         Indent amount (empty = no indent, \parindent = para indent)
  {\parheadstyle\parheadtracking}% Thm head font
  {.}%        Punctuation after thm head
  {.5em}%     Space after thm head: " " = normal interword space;
        %       \newline = linebreak
  {}% Thm head spec

\newcount\qedcount
\def\thmskip{.5mm plus .5mm}
\renewenvironment{proof}[1][\proofname]%
{\qedcount=0\noindent{\parheadstyle\parheadtracking #1.}\hskip.5em\relax}%
{\ifnum\qedcount=0\qed\fi\par\expandafter\vskip\thmskip}
%\def\proof{\begingroup\qedcount=0\noindent{\parheadstyle\parheadtracking\proofname.}\hskip.5em\relax}
%\def\endproof{\ifnum\qedcount=0\qed\fi\par\endgroup\expandafter\vskip\thmskip}
\def\qedhere{%
\ifnum\qedcount=0
	\global\advance\qedcount by 1\relax
	\ifmmode
		\ifinner
			\tag*{$\qedsymbol$}
		\else
			\eqno{\qedsymbol}
		\fi
	\else
		\hfill\qedsymbol
	\fi
\fi%
}

\theoremstyle{claim}
\newtheorem{theorem}{\wr@theorem}
\newtheorem{lemma}[theorem]{\wr@lemma}
\newtheorem{proposition}[theorem]{\wr@proposition}
\newtheorem{claim}[theorem]{\wr@claim}
\newtheorem{corollary}[theorem]{\wr@corollary}
\newtheorem{definition}{\wr@definition}
\newtheorem{example}{\wr@example}
\newtheorem{remark}{\wr@remark}

%% Floats setup

\captionsetup[figure]{labelsep=period}
\captionsetup[table]{labelsep=period}

%% Mathematical redefinition

\let\le\leqslant
\let\ge\geqslant
\let\leq\leqslant
\let\geq\geqslant
\let\emptyset\varnothing
\let\epsilon\varepsilon
\def\Re{\mathop{\mathrm{Re}}}
\def\Im{\mathop{\mathrm{Im}}}
\DeclareMathOperator*{\argmin}{arg\,min}
\DeclareMathOperator*{\argmax}{arg\,max}
\DeclareMathOperator*{\grad}{grad}
\DeclareMathOperator*{\sign}{sign}
\DeclareMathOperator*{\cov}{cov}

\allowdisplaybreaks

\renewcommand{\floatpagefraction}{.8}
\renewcommand{\topfraction}{.8}
\renewcommand{\bottomfraction}{.8}

\def\r@s@ttrivlist{\def\trivlist{%
  \parsep\parskip
  \@nmbrlistfalse
  \@trivlist
%  \labelwidth\z@
%  \leftmargin\z@
%  \itemindent\z@
  \let\@itemlabel\@empty
  \def\makelabel####1{####1}}}%

\newenvironment{paper}[1][russian]%
%%% begin paper
{%
		%\def\ref##1{\expandafter\@ldref\expandafter{\the\@countpaper-paper:##1}} %%% ???
        \newpaper
        \r@s@ttrivlist
		\def\maketitle{\makerussiantitle}%
		\def\m@kefinal{\FloatBarrier\makerussianfinal
						}%
}%
%%% end paper
{%
	\m@kefinal
	\clearpage
	\hypersetup{bookmarksdepth}
}%

\newbox\wr@tvsutikzshield
\setbox\wr@tvsutikzshield\hbox{%
\ifx\tikzpicture\undefined\else
%\begin{tikzpicture}[y=-0.012mm,x=0.012mm]%, yscale=-\globalscale, xscale=\globalscale, inner sep=0pt, outer sep=0pt]
\begin{tikzpicture}[y=-0.010mm,x=0.010mm]%, yscale=-\globalscale, xscale=\globalscale, inner sep=0pt, outer sep=0pt]
  \path[fill=black,nonzero rule] (624.1094,25.7656) -- (624.1094,4.8398) -- (707.5469,4.8398) -- (707.5469,25.7656) -- (677.5820,25.7656) -- (677.5820,117.5898) -- (654.2266,117.5898) -- (654.2266,25.7656) -- (624.1094,25.7656);
  \path[fill=black,nonzero rule] (740.4219,100.8359) .. controls (746.3789,100.8359) and (754.7578,100.9961) .. (754.7578,92.7773) .. controls (754.7578,84.2422) and (746.3789,84.5703) .. (740.0938,84.5703) -- (728.4961,84.5703) -- (728.4961,100.8359) -- cycle(738.9688,69.7422) .. controls (744.2852,69.7422) and (750.5664,69.7422) .. (750.5664,62.9766) .. controls (750.5664,56.0547) and (744.4492,55.5703) .. (738.9688,55.5703) -- (728.4961,55.5703) -- (728.4961,69.7422) -- cycle(762.0039,75.6992) .. controls (770.8594,78.4414) and (776.5039,86.0117) .. (776.5039,95.1914) .. controls (776.5039,115.1719) and (758.4609,117.7500) .. (742.8359,117.7500) -- (706.7539,117.7500) .. controls (706.7539,91.8125) and (706.7539,65.8789) .. (706.7539,39.6172) -- (737.6797,39.6172) .. controls (752.3438,39.6172) and (772.6367,40.9141) .. (772.6367,60.5625) .. controls (772.6367,67.6523) and (769.2461,73.7734) .. (762.0039,75.6992);
  \path[fill=black,nonzero rule] (811.2969,68.9414) -- (845.4414,68.9414) .. controls (845.9297,58.7969) and (837.7109,55.2422) .. (829.3398,55.2422) .. controls (820.8047,55.2422) and (813.0742,59.9219) .. (811.2969,68.9414) -- cycle(863.8086,83.4336) -- (811.1367,83.4336) .. controls (811.9375,95.5195) and (820.9570,100.1953) .. (831.7539,100.9961) .. controls (834.9727,101.1602) and (838.6836,101.3203) .. (842.0625,100.8359) .. controls (848.9922,100.0312) and (855.9141,98.2578) .. (860.5898,96.1680) -- (863.1680,112.5938) .. controls (853.9844,116.9375) and (843.3516,119.5156) .. (833.0430,119.5156) .. controls (806.9453,120.0039) and (788.5781,104.0508) .. (788.5781,77.8008) .. controls (789.0664,50.7383) and (808.7188,38.0156) .. (829.3398,38.0156) .. controls (857.6914,38.0156) and (869.7734,57.0195) .. (863.8086,83.4336);
  \path[fill=black,nonzero rule] (1029.6914,67.9688) .. controls (1026.9492,60.7227) and (1020.3516,57.1836) .. (1013.4219,57.3438) .. controls (1003.7500,57.5078) and (993.7695,64.5898) .. (993.7695,78.4414) .. controls (993.7695,92.4648) and (1003.7500,99.8711) .. (1013.4219,99.8711) .. controls (1020.5117,99.8711) and (1027.2812,96.0039) .. (1030.0195,87.7852) -- (1051.4414,87.7852) .. controls (1048.2227,108.5664) and (1030.6602,119.0391) .. (1012.7812,119.1992) .. controls (992.3203,119.3633) and (971.3867,105.8281) .. (971.3867,78.4414) .. controls (971.3867,51.2266) and (992.4805,37.5273) .. (1012.9414,37.5273) .. controls (1030.5000,37.5273) and (1047.5703,47.6758) .. (1051.1211,67.9688) -- (1029.6914,67.9688);
  \path[fill=black,nonzero rule] (1192.0703,99.5469) .. controls (1201.5703,99.7109) and (1211.0820,92.6172) .. (1211.0820,78.4414) .. controls (1211.0820,64.5898) and (1202.0625,57.5078) .. (1192.5508,57.5078) .. controls (1183.0508,57.5078) and (1173.5508,64.4258) .. (1173.5508,78.4414) .. controls (1173.5508,92.4648) and (1182.7305,99.5469) .. (1192.0703,99.5469) -- cycle(1192.5508,119.1992) .. controls (1171.9297,119.1992) and (1151.1523,105.6641) .. (1151.1523,78.4414) .. controls (1151.1523,51.5391) and (1171.4492,37.8516) .. (1191.9102,37.6875) .. controls (1212.6914,37.5273) and (1233.4727,51.0625) .. (1233.4727,78.4414) .. controls (1233.4727,105.6641) and (1213.0117,119.1992) .. (1192.5508,119.1992);
  \path[fill=black,nonzero rule] (1263.9219,5.3164) .. controls (1264.7227,20.7734) and (1275.0312,29.6328) .. (1289.8516,29.6328) .. controls (1305.3203,29.6328) and (1314.8125,20.6133) .. (1315.7891,5.3164) .. controls (1311.4297,4.6758) and (1306.7695,4.1875) .. (1302.2500,3.8633) .. controls (1301.1211,10.6328) and (1296.2891,13.2109) .. (1289.6914,13.2109) .. controls (1282.7617,13.0469) and (1278.4219,9.9922) .. (1277.7695,3.8633) -- cycle(1255.5312,117.7500) -- (1249.7422,117.7500) -- (1249.7422,39.9414) -- (1271.4922,39.9414) -- (1271.4922,79.0898) -- (1317.2305,39.6172) -- (1324.0000,39.6172) -- (1324.0000,117.5898) -- (1302.2500,117.5898) -- (1302.2500,77.4766) -- (1255.5312,117.7500);
  \path[fill=black,nonzero rule] (631.6797,294.0234) -- (631.6797,216.3789) -- (688.5430,216.3789) -- (688.5430,236.0312) -- (653.5859,236.0312) -- (653.5859,294.0234) -- (631.6797,294.0234);
  \path[fill=black,nonzero rule] (735.4727,275.9805) .. controls (744.9727,276.1445) and (754.4766,269.0508) .. (754.4766,254.8750) .. controls (754.4766,241.0234) and (745.4570,233.9414) .. (735.9492,233.9414) .. controls (726.4531,233.9414) and (716.9453,240.8633) .. (716.9453,254.8750) .. controls (716.9453,268.8867) and (726.1289,275.9805) .. (735.4727,275.9805) -- cycle(735.9492,295.6367) .. controls (715.3320,295.6367) and (694.5508,282.0977) .. (694.5508,254.8750) .. controls (694.5508,227.9766) and (714.8555,214.2852) .. (735.3086,214.1250) .. controls (756.0898,213.9609) and (776.8711,227.4961) .. (776.8711,254.8750) .. controls (776.8711,282.0977) and (756.4062,295.6367) .. (735.9492,295.6367);
  \path[fill=black,nonzero rule] (846.7773,244.4141) .. controls (844.0352,237.1562) and (837.4297,233.6172) .. (830.5117,233.7773) .. controls (820.8398,233.9414) and (810.8555,241.0234) .. (810.8555,254.8750) .. controls (810.8555,268.8867) and (820.8398,276.3047) .. (830.5117,276.3047) .. controls (837.5938,276.3047) and (844.3594,272.4375) .. (847.1016,264.2188) -- (868.5195,264.2188) .. controls (865.3047,285.0039) and (847.7383,295.4727) .. (829.8594,295.6367) .. controls (809.4023,295.7969) and (788.4609,282.2617) .. (788.4609,254.8750) .. controls (788.4609,227.6484) and (809.5664,213.9609) .. (830.0234,213.9609) .. controls (847.5859,213.9609) and (864.6562,224.1094) .. (868.2070,244.4141) -- (846.7773,244.4141);
  \path[fill=black,nonzero rule] (921.5195,301.5938) .. controls (911.2109,326.8867) and (899.4492,342.0273) .. (873.5156,330.1055) -- (875.7656,314.3164) .. controls (888.3398,319.7969) and (895.1055,315.1289) .. (899.6133,302.2422) -- (902.5156,294.1836) -- (868.5195,218.9531) .. controls (868.5195,218.1523) and (868.5195,217.1875) .. (868.5195,216.3789) -- (892.6836,216.3789) -- (913.1484,267.9258) .. controls (913.1484,267.9258) and (913.4648,267.9258) .. (913.6250,267.9258) -- (931.9922,216.3789) -- (954.3867,216.3789) .. controls (954.3867,217.1875) and (954.3867,218.1523) .. (954.3867,218.9531) -- (921.5195,301.5938);
  \path[fill=black,nonzero rule] (1014.4727,234.9062) -- (995.4609,234.9062) -- (992.4023,260.0312) -- (991.4297,265.9961) .. controls (990.7812,270.0234) and (989.3398,274.3672) .. (986.4414,276.6211) -- (1014.4727,276.6211) -- cycle(956.8008,310.7734) -- (956.1523,276.6211) -- (957.6016,276.6211) .. controls (970.3281,276.3047) and (969.3633,267.2852) .. (971.3008,255.3633) -- (977.4219,216.3789) -- (1035.5703,216.3789) -- (1035.5703,276.6211) -- (1045.8828,276.6211) -- (1045.0703,310.7734) -- (1025.5820,310.7734) -- (1025.5820,294.0234) -- (976.2930,294.0234) -- (976.2930,310.7734) -- (956.8008,310.7734);
  \path[fill=black,nonzero rule] (1295.1406,244.4141) .. controls (1292.4023,237.1562) and (1285.7891,233.6172) .. (1278.8711,233.7773) .. controls (1269.1992,233.9414) and (1259.2227,241.0234) .. (1259.2227,254.8750) .. controls (1259.2227,268.8867) and (1269.1992,276.3047) .. (1278.8711,276.3047) .. controls (1285.9609,276.3047) and (1292.7227,272.4375) .. (1295.4609,264.2188) -- (1316.8906,264.2188) .. controls (1313.6719,285.0039) and (1296.1016,295.4727) .. (1278.2305,295.6367) .. controls (1257.7695,295.7969) and (1236.8203,282.2617) .. (1236.8203,254.8750) .. controls (1236.8203,227.6484) and (1257.9297,213.9609) .. (1278.3906,213.9609) .. controls (1295.9492,213.9609) and (1313.0195,224.1094) .. (1316.5703,244.4141) -- (1295.1406,244.4141);
  \path[fill=black,nonzero rule] (1348.4609,293.6992) -- (1348.4609,236.0312) -- (1325.5898,236.0312) -- (1325.5898,216.3789) -- (1393.2500,216.3789) -- (1393.2500,236.0312) -- (1370.3711,236.0312) -- (1370.3711,293.6992) -- (1348.4609,293.6992);
  \path[fill=black,nonzero rule] (1441.0898,277.2695) .. controls (1447.0391,277.2695) and (1455.4219,277.4336) .. (1455.4219,269.2148) .. controls (1455.4219,260.6797) and (1447.0391,261.0039) .. (1440.7617,261.0039) -- (1429.1602,261.0039) -- (1429.1602,277.2695) -- cycle(1439.6328,246.1797) .. controls (1444.9492,246.1797) and (1451.2305,246.1797) .. (1451.2305,239.4102) .. controls (1451.2305,232.4883) and (1445.1094,232.0039) .. (1439.6328,232.0039) -- (1429.1602,232.0039) -- (1429.1602,246.1797) -- cycle(1462.6719,252.1445) .. controls (1471.5312,254.8750) and (1477.1719,262.4531) .. (1477.1719,271.6289) .. controls (1477.1719,291.6055) and (1459.1328,294.1836) .. (1443.5000,294.1836) -- (1407.4219,294.1836) .. controls (1407.4219,268.2461) and (1407.4219,242.3125) .. (1407.4219,216.0625) -- (1438.3516,216.0625) .. controls (1453.0000,216.0625) and (1473.3008,217.3398) .. (1473.3008,236.9961) .. controls (1473.3008,244.0898) and (1469.9102,250.2070) .. (1462.6719,252.1445);
  \path[fill=black,nonzero rule] (1511.9609,245.3789) -- (1546.1094,245.3789) .. controls (1546.5898,235.2305) and (1538.3828,231.6797) .. (1530.0000,231.6797) .. controls (1521.4609,231.6797) and (1513.7305,236.3555) .. (1511.9609,245.3789) -- cycle(1564.4727,259.8789) -- (1511.8008,259.8789) .. controls (1512.6016,271.9531) and (1521.6211,276.6211) .. (1532.4219,277.4336) .. controls (1535.6523,277.5938) and (1539.3516,277.7578) .. (1542.7305,277.2695) .. controls (1549.6602,276.4688) and (1556.5820,274.6914) .. (1561.2617,272.6016) -- (1563.8320,289.0312) .. controls (1554.6523,293.3828) and (1544.0195,295.9609) .. (1533.7109,295.9609) .. controls (1507.6094,296.4375) and (1489.2500,280.4961) .. (1489.2500,254.2344) .. controls (1489.7305,227.1719) and (1509.3906,214.4492) .. (1530.0000,214.4492) .. controls (1558.3516,214.4492) and (1570.4297,233.4531) .. (1564.4727,259.8789);
  \path[fill=black,nonzero rule] (1656.9414,216.3789) -- (1656.9414,294.0234) -- (1635.1992,294.0234) -- (1635.1992,263.4180) -- (1604.2695,263.4180) -- (1604.2695,294.0234) -- (1582.5195,294.0234) -- (1582.5195,216.3789) -- (1604.2695,216.3789) -- (1604.2695,244.0898) -- (1635.1992,244.0898) -- (1635.1992,216.3789) -- (1656.9414,216.3789);
  \path[fill=black,nonzero rule] (1752.3125,216.3789) -- (1752.3125,294.0234) -- (1730.5625,294.0234) -- (1730.5625,263.4180) -- (1699.6328,263.4180) -- (1699.6328,294.0234) -- (1677.8906,294.0234) -- (1677.8906,216.3789) -- (1699.6328,216.3789) -- (1699.6328,244.0898) -- (1730.5625,244.0898) -- (1730.5625,216.3789) -- (1752.3125,216.3789);
  \path[fill=black,nonzero rule] (1855.5625,216.5391) -- (1876.5117,216.5391) -- (1876.5117,294.0234) -- (1855.5625,294.0234) -- cycle(1794.8320,256.0000) -- (1794.8320,277.2695) -- (1807.3906,277.2695) .. controls (1815.4492,277.2695) and (1820.4414,273.0781) .. (1820.4414,266.6367) .. controls (1820.4414,260.0312) and (1815.4492,256.0000) .. (1807.3906,256.0000) -- cycle(1773.2500,294.0234) -- (1773.2500,216.3789) -- (1794.8320,216.3789) -- (1794.8320,239.0977) -- (1807.7227,239.0977) .. controls (1826.0898,239.0977) and (1842.1914,246.6641) .. (1842.1914,266.6367) .. controls (1842.1914,286.2891) and (1825.7617,294.0234) .. (1807.7227,294.0234) -- (1773.2500,294.0234);
    \path[fill=black,nonzero rule] (1911.6211,181.7461) .. controls (1912.4297,197.2109) and (1922.7422,206.0664) .. (1937.5625,206.0664) .. controls (1953.0195,206.0664) and (1962.5195,197.0469) .. (1963.5000,181.7461) .. controls (1959.1406,181.1055) and (1954.4805,180.6172) .. (1949.9609,180.2930) .. controls (1948.8320,187.0625) and (1944.0000,189.6406) .. (1937.4023,189.6406) .. controls (1930.4727,189.4766) and (1926.1211,186.4141) .. (1925.4805,180.2930) -- cycle(1903.2422,294.1836) -- (1897.4492,294.1836) -- (1897.4492,216.3789) -- (1919.1914,216.3789) -- (1919.1914,255.5234) -- (1964.9414,216.0625) -- (1971.7109,216.0625) -- (1971.7109,294.0234) -- (1949.9609,294.0234) -- (1949.9609,253.9102) -- (1903.2422,294.1836);
  \path[fill=black,nonzero rule] (675.3320,478.0273) .. controls (665.0195,503.3125) and (653.2617,518.4609) .. (627.3242,506.5391) -- (629.5898,490.7500) .. controls (642.1484,496.2305) and (648.9062,491.5625) .. (653.4219,478.6758) -- (656.3242,470.6172) -- (622.3320,395.3867) .. controls (622.3320,394.5859) and (622.3320,393.6211) .. (622.3320,392.8125) -- (646.4922,392.8125) -- (666.9492,444.3594) .. controls (666.9492,444.3594) and (667.2734,444.3594) .. (667.4375,444.3594) -- (685.8047,392.8125) -- (708.1875,392.8125) .. controls (708.1875,393.6211) and (708.1875,394.5859) .. (708.1875,395.3867) -- (675.3320,478.0273);
  \path[fill=black,nonzero rule] (796.1406,392.8125) -- (796.1406,470.4570) -- (774.3984,470.4570) -- (774.3984,439.8516) -- (743.4688,439.8516) -- (743.4688,470.4570) -- (721.7227,470.4570) -- (721.7227,392.8125) -- (743.4688,392.8125) -- (743.4688,420.5234) -- (774.3984,420.5234) -- (774.3984,392.8125) -- (796.1406,392.8125);
  \path[fill=black,nonzero rule] (822.8789,470.6172) -- (817.0859,470.6172) -- (817.0859,392.8125) -- (838.8320,392.8125) -- (838.8320,431.9570) -- (884.5742,392.4883) -- (891.3438,392.4883) -- (891.3438,470.4570) -- (869.5977,470.4570) -- (869.5977,430.3477) -- (822.8789,470.6172);
  \path[fill=black,nonzero rule] (945.9648,453.7031) .. controls (951.9180,453.7031) and (960.3008,453.8672) .. (960.3008,445.6484) .. controls (960.3008,437.1133) and (951.9180,437.4375) .. (945.6367,437.4375) -- (934.0391,437.4375) -- (934.0391,453.7031) -- cycle(944.5117,422.6133) .. controls (949.8281,422.6133) and (956.1094,422.6133) .. (956.1094,415.8438) .. controls (956.1094,408.9258) and (949.9922,408.4375) .. (944.5117,408.4375) -- (934.0391,408.4375) -- (934.0391,422.6133) -- cycle(967.5469,428.5703) .. controls (976.4062,431.3086) and (982.0508,438.8789) .. (982.0508,448.0625) .. controls (982.0508,468.0430) and (964.0039,470.6172) .. (948.3789,470.6172) -- (912.2969,470.6172) .. controls (912.2969,444.6836) and (912.2969,418.7461) .. (912.2969,392.4883) -- (943.2227,392.4883) .. controls (957.8867,392.4883) and (978.1797,393.7852) .. (978.1797,413.4297) .. controls (978.1797,420.5234) and (974.7891,426.6406) .. (967.5469,428.5703);
  \path[fill=black,nonzero rule] (1016.8398,421.8125) -- (1050.9805,421.8125) .. controls (1051.4727,411.6641) and (1043.2500,408.1133) .. (1034.8828,408.1133) .. controls (1026.3516,408.1133) and (1018.6094,412.7891) .. (1016.8398,421.8125) -- cycle(1069.3516,436.3008) -- (1016.6797,436.3008) .. controls (1017.4805,448.3867) and (1026.5000,453.0625) .. (1037.3008,453.8672) .. controls (1040.5117,454.0273) and (1044.2305,454.1914) .. (1047.6094,453.7031) .. controls (1054.5391,452.9023) and (1061.4609,451.1250) .. (1066.1328,449.0352) -- (1068.7109,465.4648) .. controls (1059.5312,469.8086) and (1048.8906,472.3867) .. (1038.5820,472.3867) .. controls (1012.4922,472.8711) and (994.1211,456.9219) .. (994.1211,430.6719) .. controls (994.6094,403.6055) and (1014.2617,390.8828) .. (1034.8828,390.8828) .. controls (1063.2305,390.8828) and (1075.3203,409.8906) .. (1069.3516,436.3008);
  \path[fill=black,nonzero rule] (1234.5195,420.8398) .. controls (1231.7812,413.5938) and (1225.1914,410.0508) .. (1218.2500,410.2148) .. controls (1208.5898,410.3750) and (1198.6016,417.4609) .. (1198.6016,431.3086) .. controls (1198.6016,445.3320) and (1208.5898,452.7383) .. (1218.2500,452.7383) .. controls (1225.3398,452.7383) and (1232.1094,448.8711) .. (1234.8516,440.6562) -- (1256.2695,440.6562) .. controls (1253.0508,461.4375) and (1235.4922,471.9062) .. (1217.6094,472.0703) .. controls (1197.1523,472.2305) and (1176.2227,458.6953) .. (1176.2227,431.3086) .. controls (1176.2227,404.0938) and (1197.3125,390.3945) .. (1217.7695,390.3945) .. controls (1235.3320,390.3945) and (1252.4023,400.5430) .. (1255.9492,420.8398) -- (1234.5195,420.8398);
  \path[fill=black,nonzero rule] (1277.5312,470.6172) -- (1271.7305,470.6172) -- (1271.7305,392.8125) -- (1293.4805,392.8125) -- (1293.4805,431.9570) -- (1339.2227,392.4883) -- (1345.9922,392.4883) -- (1345.9922,470.4570) -- (1324.2422,470.4570) -- (1324.2422,430.3477) -- (1277.5312,470.6172);
  \path[fill=black,nonzero rule] (1383.0312,470.1328) -- (1383.0312,412.4648) -- (1360.1602,412.4648) -- (1360.1602,392.8125) -- (1427.8203,392.8125) -- (1427.8203,412.4648) -- (1404.9414,412.4648) -- (1404.9414,470.1328) -- (1383.0312,470.1328);
  \path[fill=black,nonzero rule] (1459.4023,421.8125) -- (1493.5508,421.8125) .. controls (1494.0312,411.6641) and (1485.8125,408.1133) .. (1477.4414,408.1133) .. controls (1468.9102,408.1133) and (1461.1797,412.7891) .. (1459.4023,421.8125) -- cycle(1511.9102,436.3008) -- (1459.2422,436.3008) .. controls (1460.0391,448.3867) and (1469.0625,453.0625) .. (1479.8594,453.8672) .. controls (1483.0703,454.0273) and (1486.7891,454.1914) .. (1490.1719,453.7031) .. controls (1497.1016,452.9023) and (1504.0195,451.1250) .. (1508.6914,449.0352) -- (1511.2695,465.4648) .. controls (1502.0898,469.8086) and (1491.4609,472.3867) .. (1481.1523,472.3867) .. controls (1455.0508,472.8711) and (1436.6797,456.9219) .. (1436.6797,430.6719) .. controls (1437.1719,403.6055) and (1456.8203,390.8828) .. (1477.4414,390.8828) .. controls (1505.7891,390.8828) and (1517.8828,409.8906) .. (1511.9102,436.3008);
  \path[fill=black,nonzero rule] (1546.0625,470.1328) -- (1546.0625,412.4648) -- (1523.1914,412.4648) -- (1523.1914,392.8125) -- (1590.8516,392.8125) -- (1590.8516,412.4648) -- (1567.9609,412.4648) -- (1567.9609,470.1328) -- (1546.0625,470.1328);
  \path[fill=black,nonzero rule] (903.8711,95.5195) .. controls (919.8164,105.0234) and (936.8906,97.7734) .. (936.8906,78.1211) .. controls (936.8906,67.8125) and (931.4141,57.5039) .. (919.9766,57.5039) .. controls (909.8281,57.6641) and (904.0312,66.0391) .. (903.8711,75.2227) -- cycle(900.1641,51.8633) .. controls (904.5117,42.1992) and (914.6641,37.6875) .. (924.6484,37.6875) .. controls (947.3633,37.6875) and (959.6055,57.0195) .. (959.6055,78.1211) .. controls (959.6055,108.8867) and (931.5742,127.8984) .. (904.5117,114.2031) -- (904.5117,157.3750) -- (881.9648,157.3750) .. controls (881.9648,157.3750) and (881.9648,71.3125) .. (881.9648,62.7031) .. controls (881.9648,54.0938) and (878.8711,40.4727) .. (878.8711,40.4727) -- (898.8438,38.0117) .. controls (900.3398,45.1523) and (899.8164,47.4648) .. (900.1641,51.8633);
  \path[fill=black,nonzero rule] (1169.3320,271.9531) .. controls (1185.2695,281.4570) and (1202.3516,274.2070) .. (1202.3516,254.5547) .. controls (1202.3516,244.2461) and (1196.8711,233.9375) .. (1185.4297,233.9375) .. controls (1175.2891,234.0977) and (1169.4922,242.4766) .. (1169.3320,251.6562) -- cycle(1165.6211,228.3008) .. controls (1169.9727,218.6367) and (1180.1211,214.1250) .. (1190.1094,214.1250) .. controls (1212.8203,214.1250) and (1225.0625,233.4531) .. (1225.0625,254.5547) .. controls (1225.0625,285.3242) and (1197.0312,304.3320) .. (1169.9727,290.6406) -- (1169.9727,333.8086) -- (1147.4219,333.8086) .. controls (1147.4219,333.8086) and (1147.4219,247.7461) .. (1147.4219,239.1367) .. controls (1147.4219,230.5273) and (1144.3320,216.9102) .. (1144.3320,216.9102) -- (1164.3008,214.4492) .. controls (1165.7891,221.5859) and (1165.2695,223.8984) .. (1165.6211,228.3008);
  \path[fill=black,nonzero rule] (1108.7109,448.3867) .. controls (1124.6602,457.8906) and (1141.7305,450.6445) .. (1141.7305,430.9922) .. controls (1141.7305,420.6836) and (1136.2500,410.3711) .. (1124.8203,410.3711) .. controls (1114.6719,410.5352) and (1108.8711,418.9102) .. (1108.7109,428.0938) -- cycle(1105.0000,404.7344) .. controls (1109.3516,395.0703) and (1119.5000,390.5586) .. (1129.4922,390.5586) .. controls (1152.1992,390.5586) and (1164.4414,409.8906) .. (1164.4414,430.9922) .. controls (1164.4414,461.7578) and (1136.4102,480.7656) .. (1109.3516,467.0742) -- (1109.3516,510.2422) -- (1086.8008,510.2422) .. controls (1086.8008,510.2422) and (1086.8008,424.1797) .. (1086.8008,415.5703) .. controls (1086.8008,406.9648) and (1083.7109,393.3438) .. (1083.7109,393.3438) -- (1103.6797,390.8828) .. controls (1105.1797,398.0195) and (1104.6523,400.3359) .. (1105.0000,404.7344);
  \path[fill=black,nonzero rule] (1100.8320,68.6484) -- (1119.5703,39.7344) -- (1142.5000,39.7344) -- (1142.5000,41.6289) -- (1120.5391,76.5508) -- (1142.5000,115.1641) -- (1142.5000,117.4258) -- (1119.5703,117.4258) -- (1100.8320,84.6367) -- (1089.3594,84.6367) -- (1089.3594,117.4258) -- (1066.9102,117.4258) -- (1066.9102,39.7344) -- (1089.3594,39.7344) -- (1089.3594,68.6484) -- (1100.8320,68.6484);
  \path[fill=black,nonzero rule] (1106.8828,262.1289) .. controls (1102.3711,259.0664) and (1096.4102,257.6172) .. (1090.7695,257.6172) .. controls (1083.6797,258.1016) and (1077.8828,262.1289) .. (1078.6914,269.6992) .. controls (1079.1719,275.3398) and (1084.1602,278.0742) .. (1089.3203,278.0742) .. controls (1096.7305,278.0742) and (1106.0703,274.3711) .. (1106.8828,266.1562) -- cycle(1110.7305,281.3633) .. controls (1106.0625,291.0273) and (1094.8008,295.4727) .. (1084.8125,295.4727) .. controls (1070.3125,295.4727) and (1057.1016,286.1289) .. (1056.6211,271.1484) .. controls (1055.8125,252.1445) and (1069.5117,243.1211) .. (1086.7422,243.1211) .. controls (1093.6719,243.1211) and (1101.5625,244.4102) .. (1107.3594,248.1133) -- (1107.3594,242.8008) .. controls (1107.3594,233.2969) and (1095.7617,231.6836) .. (1088.0312,231.6836) .. controls (1079.8203,231.6836) and (1072.2422,232.6523) .. (1065.6406,236.3555) -- (1062.7422,220.2461) .. controls (1070.9609,216.3828) and (1081.4297,214.4492) .. (1091.9023,214.4492) .. controls (1111.8711,214.4492) and (1128.9492,221.0547) .. (1128.9492,243.4453) .. controls (1128.9492,243.4453) and (1128.9492,261.8594) .. (1128.9492,267.5000) .. controls (1128.9492,281.4609) and (1132.0195,292.7539) .. (1132.0195,292.7539) -- (1112.0508,295.2148) .. controls (1111.5000,293.0938) and (1110.7305,288.2070) .. (1110.7305,281.3633);
  \path[fill=black,nonzero rule] (239.6523,84.6484) -- (329.0664,39.9414) -- (479.3047,39.9414) -- (479.3047,0.0000) -- (319.5352,0.0000) -- (239.6523,39.9414) -- (159.7695,0.0000) -- (0.0000,0.0000) -- (0.0000,39.9414) -- (150.2383,39.9414) -- (239.6523,84.6484);
    \path[fill=black,nonzero rule] (439.3633,494.4102) -- (239.6523,594.2969) -- (39.9414,494.4102) -- (39.9414,239.6523) -- (0.0000,239.6523) -- (0.0000,519.2148) -- (239.6523,639.0742) -- (479.3047,519.2148) -- (479.3047,239.6523) -- (439.3633,239.6523) -- (439.3633,494.4102);
  \path[fill=black,nonzero rule] (292.6797,119.8281) -- (292.6797,487.7852) -- (332.6211,467.8125) -- (332.6211,159.7773) -- (479.3047,159.7695) -- (479.3047,119.8281) -- (292.6797,119.8281);
  \path[fill=black,nonzero rule] (146.6836,467.8125) -- (186.6250,487.7852) -- (186.6250,119.8281) -- (0.0000,119.8281) -- (0.0000,159.7695) -- (146.6836,159.7773) -- (146.6836,467.8125);
\end{tikzpicture}\fi}

\makeatother
\endinput
