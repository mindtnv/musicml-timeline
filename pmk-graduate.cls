\NeedsTeXFormat{LaTeX2e}
\ProvidesClass{pmk-graduate}[2025/09/01 LaTeX class for graduate papers]

\newif\ifpapertypedefined
\newif\ifbachelor
\newif\ifmaster
\newif\iftermpaper
\newif\ifessay

\newif\ifdocumenttypedefined
\newif\ifnotassign
\newif\ifassign
\newif\ifpaper
\newif\ifsummary

\newif\ifwindows

\newif\ifappendix

\DeclareOption{bachelor}{\bachelortrue}
\DeclareOption{master}{\mastertrue}
\DeclareOption{termpaper}{\termpapertrue}
\DeclareOption{essay}{\essaytrue}

\DeclareOption{assignment}{\assigntrue}
\DeclareOption{paper}{\papertrue}
\DeclareOption{summary}{\summarytrue}

\DeclareOption{cp1251}{\windowstrue}
\ProcessOptions\relax

\ifbachelor
    \papertypedefinedtrue
    \ifmaster
        \error{Incompatible options: 'bachelor' and 'master'}
    \fi
    \iftermpaper
        \error{Incompatible options: 'bachelor' and 'termpaper'}
    \fi
    \ifessay
        \error{Incompatible options: 'bachelor' and 'essay'}
    \fi
\fi
\ifmaster
    \papertypedefinedtrue
    \iftermpaper
        \error{Incompatible options: 'master' and 'termpaper'}
    \fi
    \ifessay
        \error{Incompatible options: 'master' and 'essay'}
    \fi
\fi
\iftermpaper
    \papertypedefinedtrue
    \ifessay
        \error{Incompatible options: 'termpaper' and 'essay'}
    \fi
\fi
\ifessay
    \papertypedefinedtrue
\fi
\ifpapertypedefined\else
    \error{Paper type is not defined: 'bachelor', 'master', 'termpaper', or 'essay'}
\fi

\ifassign
    \documenttypedefinedtrue
    \ifpaper
        \error{Incompatible options: 'assignment' and 'paper'}
    \fi
    \ifsummary
        \error{Incompatible options: 'assignment' and 'summary'
    \fi
    \ifessay
        \error{Incompatible options: 'assignment' and 'essay'}
    \fi
\fi
\ifpaper
    \documenttypedefinedtrue
    \notassigntrue
    \ifsummary
        \error{Incompatible options: 'summary' and 'paper'}
    \fi
\fi
\ifsummary
    \documenttypedefinedtrue
    \notassigntrue
    \ifbachelor
        \error{Incompatible options: 'summary' and 'bachelor'}
    \fi
    \iftermpaper
        \error{Incompatible options: 'summary' and 'termpaper'}
    \fi
    \ifessay
        \error{Incompatible options: 'summary' and 'essay'}
    \fi
\fi
\ifdocumenttypedefined\else
    \error{Document type is not defined: 'paper', 'assignment', or 'summary'}
\fi


\ifassign
    \ifbachelor
        \LoadClass[14pt,a4paper,landscape]{extarticle}
    \fi %\ifbachelor
    \ifmaster
        \LoadClass[12pt,a4paper]{extarticle}
    \fi %\ifmaster
    \iftermpaper
        \LoadClass[14pt,a4paper,landscape]{extarticle}
    \fi %\iftermpaper
\fi %\ifassign
\ifpaper
    \ifessay
        \LoadClass[14pt,a4paper]{extarticle}
    \else
        \LoadClass[14pt,a4paper]{extreport}
    \fi %\ifessay
\fi %\ifpaper
\ifsummary
    \LoadClass[10pt,a5paper,twoside]{extarticle}
\fi %\ifsummary

\ifwindows
    \RequirePackage[cp1251]{inputenc}
\else  %\ifwindows
    \RequirePackage[utf8]{inputenc}
\fi %\ifwindows
\RequirePackage[T2A]{fontenc}
\RequirePackage[english,russian]{babel}
\RequirePackage{tocloft}
\RequirePackage{indentfirst}
\RequirePackage{graphicx}
\RequirePackage{longtable}
\RequirePackage{ragged2e}
\RequirePackage{tabu}
\RequirePackage{enumitem}
\RequirePackage{xcolor}
\RequirePackage{environ}
\RequirePackage{trimspaces}
\usepackage[activate={true,nocompatibility},final=true]{microtype}
\usepackage[svgnames]{xcolor}
\usepackage{caption}
\usepackage{fancyhdr}
\usepackage{titlesec}
\usepackage{csquotes}

\ifsummary
    \def\defernumbersoption{defernumbers=true,}
\else
    \def\defernumbersoption{}
\fi %\ifsummary

\usepackage[backend=biber,%
        maxnames=3,minnames=3,%
        style=gost-numeric,%
%        useauthor=false,%
        language=auto, % получение языка из babel
        autolang=other,%
        otherlangs=true,%
        \defernumbersoption
        sorting=nty]{biblatex}
        
\usepackage[unicode,colorlinks,linkcolor=blue,draft=false,breaklinks,bookmarksopen,pdflang=ru-RU]{hyperref}
\usepackage[russian]{varioref}

\def\assignfont{\upshape}

\addto\extrasrussian{%
	\def\reftextfaraway#1{на~стр.\,\pageref{#1}}%
	\def\reftextpagerange#1#2{на~стр.\,\pageref{#1}--\pageref{#2}}%
}

\setlength{\biblabelsep}{.5em}
\def\bibnamedelimd{\,\hspace{0pt}}
\def\bibinitdelim{\,\hspace{0pt}}
\def\bibname{Список литературы}
\def\selfbibname{Публикации}

\ifnotassign
    \linespread{1.15}
    
    \renewcommand*{\mkgostheading}[1]{{\slshape #1}}
    \renewcommand*{\revsdnamepunct}{,\addspace}
    \DeclareFieldFormat{labelnumberwidth}{[#1]}
    \def\printthebibliography{%
        \clearpage
        \phantomsection
        \addcontentsline{toc}{chapter}{\bibname}%
        \toggletrue{bbx:gostbibliography}%
        \printbibliography[title={\bibname}]}
    \def\printfullbibliography{%
        \nocite{*}
        \phantomsection
        \addcontentsline{toc}{chapter}{\bibname}%
        \toggletrue{bbx:gostbibliography}%
        \printbibliography[title={\bibname}]}
    \def\printselfbibliography{%
        \nocite{*}
        \toggletrue{bbx:gostbibliography}%
        \oldsection*{\selfbibname}%
        \printbibliography[%
            resetnumbers=1,%
            heading=none,%
            keyword=self%
            ]}
    
    \let\oldappendix\appendix
    \let\oldchapter\chapter
    \let\oldsection\section
    \let\oldsubsection\subsection
    \let\oldsubsubsection\subsubsection

    \ifpaper
        \makeatletter
        \def\sectionsign{\S\,}
        \def\appendix@chapter#1{%
            \refstepcounter{chapter}%
            \oldchapter*{Приложение \Asbuk{chapter}\\{}#1}%
            \addcontentsline{toc}{chapter}{Приложение \Asbuk{chapter}. {}#1}%
            }
        \def\appendix{%
            \oldappendix
            \appendixtrue
            \def\sectionsign{}
            \let\chapter\appendix@chapter
            \def\section{\oldsection*}%
            \def\subsection{\oldsubsection*}%
            \def\subsubsection{\oldsubsubsection*}%
            }
            
        \def\cftchapleader{\cftdotfill{\cftdotsep}}
        \def\l@chapter#1#2{\hbox to \hsize{\bfseries\def\numberline##1{Глава ##1. }%
            #1\cftdotfill{\cftdotsep}#2}}
        \ifessay
            \def\l@section#1#2{\hbox to \hsize{\bfseries\def\numberline##1{##1\,}%
            #1\cftdotfill{\cftdotsep}#2}}
            \renewcommand{\thesection}{\sectionsign\arabic{section}.}
            \renewcommand{\thesubsection}{\thesection\arabic{subsection}.}
            \renewcommand{\thesubsubsection}{\thesubsection\arabic{subsubsection}.}
            \titleformat*{\section}{\raggedright\bfseries\LARGE}
            \titleformat*{\subsection}{\raggedright\slshape\bfseries\Large}
            \titleformat*{\subsubsection}{\raggedright\slshape\bfseries\large}
        \else
            \renewcommand{\thesection}{\sectionsign\thechapter.\arabic{section}.}
            \renewcommand{\thesubsection}{\thesection\arabic{subsection}.}
            \renewcommand{\thesubsubsection}{\thesubsection\arabic{subsubsection}.}
            \titleformat*{\section}{\raggedright\bfseries\LARGE}
            \titleformat*{\subsection}{\raggedright\slshape\bfseries\Large}
            \titleformat*{\subsubsection}{\raggedright\slshape\bfseries\large}
        \fi %\ifessay
    
        \makeatother
        
        \fancyhead[L]{}
        \fancyhead[R]{\thepage}
        \fancyfoot[L,C,R]{}
    \fi %\ifpaper
    \ifsummary
        \def\section{\oldsection*}%
        \def\subsection{\oldsubsection*}%
        \def\subsubsection{\oldsubsubsection*}%
        
        \fancyfoot[C]{\thepage}
        \renewcommand{\headrulewidth}{0pt}
    \fi %\ifsummary
    
    \captionsetup[figure]{name={Рис.},labelsep=period}
    
    \def\textso#1{\textls[200]{#1}}
    \def\so{\SetTracking{encoding=*}{200}\lsstyle}
    \let\emph\textso
    \let\em\so
       
\fi %\ifnotassign

\ifassign
    \ifbachelor
        \voffset=-1in
        \topmargin=15mm
        \headheight=0mm
        \headsep=0mm
        \textheight=180mm
        
        \hoffset=-1in
        \oddsidemargin=10mm
        \evensidemargin=10mm
        \textwidth=277mm
        \def\pagewidth{128.3mm}
        \def\pagesep{20mm}
    \fi %\ifbachelor
    
    \iftermpaper
        \voffset=-1in
        \topmargin=15mm
        \headheight=0mm
        \headsep=0mm
        \textheight=180mm
        
        \hoffset=-1in
        \oddsidemargin=10mm
        \evensidemargin=10mm
        \textwidth=277mm
        \def\pagewidth{128.3mm}
        \def\pagesep{20mm}
    \fi %\iftermpaper
    
    \ifmaster
        \voffset=-1in
        \topmargin=20mm
        \headheight=0mm
        \headsep=0mm
        \textheight=257mm
        
        \hoffset=-1in
        \oddsidemargin=25mm
        \evensidemargin=15mm
        \textwidth=170mm
    \fi %\ifmaster
\fi %\ifassign

\ifpaper
    \voffset=-1in
    \topmargin=12mm
    \headheight=6.2mm
    \headsep=5mm
    \textheight=255mm
    
    \hoffset=-1in
    \oddsidemargin=25mm
    \evensidemargin=25mm
    \textwidth=170mm
\fi %\ifpaper

\ifsummary
    \voffset=-1in
    \topmargin=15mm
    \headheight=0mm
    \headsep=0mm
    \textheight=175mm
    
    \hoffset=-1in
    \oddsidemargin=20mm
    \evensidemargin=15mm
    \textwidth=113.50mm
\fi %\ifpaper

\ifassign
    \pagestyle{empty}
\fi %\ifassign
\ifsummary
    \pagestyle{plain}
\fi %\ifsummary
\ifpaper
    \pagestyle{fancy}
    \fancypagestyle{plain}[fancy]{}
\fi %\ifpaper

\makeatletter

\let\brief\relax
\let\position\relax
\let\degree\relax
\let\rank\relax
\let\english\relax
\let\result\relax
\def\emptymacro{}

\def\ye@r#1-#2\@nd{%
    \def\yeari{#1}%
    \def\yearii{#2}%
}
\def\year#1{\ye@r#1\@nd}

\def\orderdatename{\underline{\hspace*{25mm}}}
\def\ordernumbername{\underline{\hspace*{18mm}}}
\def\order#1#2{%
    \iftermpaper
        \error{Incompatible command: 'order' is incompatible with 'termpaper'}%
    \fi %\iftermpaper
    \ifessay
        \error{Incompatible command: 'order' is incompatible with 'essay'}%
    \fi %\ifessay
    \def\orderdatename{#1}%
    \def\ordernumbername{#2}%
}

\def\subject#1{%
    \ifbachelor
        \error{Incompatible command: 'subject' is incompatible with 'bachelor'}%
    \fi %\iftermpaper
    \ifmaster
        \error{Incompatible command: 'subject' is incompatible with 'master'}%
    \fi %\ifessay
    \def\subjectname{#1}%
}

\def\stud@nt#1\brief#2\group#3\english#4\@nd{%
    \def\studentname{#1}%
    \def\briefstudentname{#2}%
    \def\groupstudentname{#3}%
    \def\englishstudentname{#4}%
    \trim@spaces@in\studentname
    \trim@spaces@in\briefstudentname
    \trim@spaces@in\groupstudentname
    \trim@spaces@in\englishstudentname
    }
\def\student#1{\stud@nt#1\english\@nd}

\def\supervis@r#1\brief#2\position#3\degree#4\rank#5\@nd{%
    \def\supervisername{#1}%
    \def\briefsupervisername{#2}%
    \def\positionsupervisername{#3}%
    \def\degreesupervisername{#4}%
    \def\ranksupervisername{#5}%
    \trim@spaces@in\supervisername
    \trim@spaces@in\briefsupervisername
    \trim@spaces@in\positionsupervisername
    \trim@spaces@in\degreesupervisername
    \trim@spaces@in\ranksupervisername
}

\def\superviser#1{\supervis@r#1\degree\rank\@nd}

\def\program#1{%
    \def\programname{#1}%
}

\def\titl@#1\english#2\@nd{
    \def\titlename{#1}
    \def\englishtitlename{#2}
    \trim@spaces@in\titlename
    \trim@spaces@in\englishtitlename
    }
\def\title#1{\titl@#1\english\@nd}

\def\goal#1{\def\goalname{#1}}

\def\programnameics{Информатика и компьютерные науки}
\def\specialitynameics{02.03.02 Фундаментальная информатика и информационные технологии}
\def\headnameics{С.\,М.\,Дудаков}
\def\programnameswi{Инженерия программного обеспечения}
\def\specialitynameswi{02.03.02 Фундаментальная информатика и информационные технологии}
\def\headnameswi{С.\,М.\,Дудаков}
\def\programnameswiai{Программная инженерия в искусственном интеллекте}
\def\specialitynameswiai{02.03.02 Фундаментальная информатика и информационные технологии}
\def\headnameswiai{С.\,М.\,Дудаков}
\def\programnameaida{Искусственный интеллект и анализ данных}
\def\specialitynameaida{01.03.02 Прикладная математика и информатика}
\def\headnameaida{С.\,М.\,Дудаков}
\def\programnamemm{Математическое моделирование}
\def\specialitynamemm{01.03.02 Прикладная математика и информатика}
\def\headnamemm{С.\,М.\,Дудаков}
\def\programnamesa{Системный анализ}
\def\specialitynamesa{01.03.02 Прикладная математика и информатика}
\def\headnamesa{С.\,М.\,Дудаков}
\def\programnameicpim{Инженерное компьютерное проектирование и индустриальная математика}
\def\specialitynameicpim{01.03.02 Прикладная математика и информатика}
\def\headnameicpim{С.\,М.\,Дудаков}
\def\programnameacse{Прикладная информатика в экономике}
\def\specialitynameacse{09.03.03 Прикладная информатика}
\def\headnameacse{С.\,М.\,Дудаков}
\def\programnameacsm{Прикладная информатика в мехатронике}
\def\specialitynameacsm{09.03.03 Прикладная информатика}
\def\headnameacsm{С.\,М.\,Дудаков}
\def\programnameicmrs{Интеллектуальное управление в мехатронных и робототехнических системах}
\def\specialitynameicmrs{15.03.06 Мехатроника и робототехника}
\def\headnameicmrs{С.\,М.\,Дудаков}
\def\programnamemacsae{Прикладная информатика в аналитической экономике}
\def\specialitynamemacsae{09.04.03 Прикладная информатика}
\def\headnamemacsae{Г.\,М.\,Соломаха}
\def\programnamemista{Интеллектуальные системы. Теория и приложения}
\def\specialitynamemista{09.04.03 Прикладная информатика}
\def\headnamemista{С.\,М.\,Дудаков}
\def\programnamemsp{Системное программирование}
\def\specialitynamemsp{01.04.02 Прикладная математика и информатика}
\def\headnamemsp{С.\,М.\,Дудаков}
\def\programnamemsa{Системный анализ}
\def\specialitynamemsa{01.04.02 Прикладная математика и информатика}
\def\headnamemsa{А.\,В.\,Язенин}
\def\programnamemitcd{Информационные технологии в управлении и принятии решений}
\def\specialitynamemitcd{02.04.02 Фундаментальная информатика и информационные технологии}
\def\headnamemitcd{А.\,В.\,Язенин}

\def\task#1{\relax}
\def\image{\item}
\def\adviser{\item}

\def\taskt@sk#1\result#2\@nd{\item #1}
\def\tasktask#1{\taskt@sk#1\result\@nd}
\def\taskres@lt#1\result#2\@nd{\item #2}
\def\taskresult#1{\taskres@lt#1\result\@nd}

\let\tasksname\relax
\let\imagesname\relax
\let\advisersname\relax

\NewEnviron{tasks}{\global\let\tasksname\BODY}
\NewEnviron{images}{\global\let\imagesname\BODY}
\NewEnviron{advisers}{\global\let\advisersname\BODY}
\NewEnviron{englishabstract}{\global\let\englishabstractname\BODY}

\def\tablestrut{\vrule width 0mm height 2ex depth 4ex}
\def\itemskip{2mm}
\def\uspace#1{\underline{\hspace*{#1}}}

\AddEnumerateCounter*{\asbuk}{\c@asbuk}{7}
\setlist[enumerate,1]{label={\upshape\mdseries\arabic{*})},itemsep=0mm}
\setlist[enumerate,2]{label={\upshape\asbuk*)},itemsep=0mm}
\setlist[enumerate,3]{label={\upshape\roman*)},itemsep=0mm}

\makeatother

\ifbachelor
    \def\makeassignment{%
    \linespread{1.03}
    \noindent
    \begin{minipage}[t]{\pagewidth}%
    \begin{center}
    {\bfseries Календарный график}\\
    выполнения ВКР
    \end{center}
    
    \begin{tabu}{|X[3,L]|X[1,C]|X[1,C]|}
    %\cline{1-3}
    \hline
    Выполняемая работа & Сроки выполнения & Отметка о выполнении\hskip0mm\strut\\
    \hline
    %\cline{1-3}
    Выбор научного руководителя и темы ВКР\hskip0mm\strut & 30.09.\yeari\tablestrut& \strut\\
    \cline{1-3}
    Представление полностью оформленного задания на ВКР руководителю ООП\hskip0mm\strut & 01.11.\yeari\tablestrut& \strut\\
    \cline{1-3}
    Первый промежуточный отчёт\hskip0mm\strut & 31.12.\yeari\tablestrut & \\
    \cline{1-3}
    Второй промежуточный отчёт\hskip0mm\strut & 31.03.\yearii\tablestrut & \\
    \cline{1-3}
    Доклад на студенческой конференции\hskip0mm\strut & 30.04.\yearii\tablestrut & \\
    \cline{1-3}
    Сдача ВКР научному руководителю\hskip0mm\strut & 15.05.\yearii\tablestrut & \\
    \cline{1-3}
    Сдача ВКР руководителю ООП\hskip0mm\strut & 25.05.\yearii\tablestrut & \\
    \cline{1-3}
    \end{tabu}
    
    \vskip3mm
    01.11.\yeari
    
    \vskip10mm
    Подпись научного руководителя \hrulefill\space \briefsupervisername
    
    \vskip10mm
    Подпись обучающегося  \hrulefill\space \briefstudentname
    \end{minipage}%
    \hspace*{\pagesep}%
    \begin{minipage}[t]{\pagewidth}%
    \begin{center}
    {\bfseries\small ФГБОУ ВО «Тверской государственный университет»}
    \vskip3mm
    \hrule
    \vskip3mm
    Направление \csname specialityname\programname\endcsname
    
    \vskip2mm
    ООП <<\csname programname\programname\endcsname>>
    \end{center}
    
    \begin{flushright}
    \begin{minipage}{.5\textwidth}
    \begin{center}
    УТВЕРЖДАЮ
    
    Руководитель ООП
    
    \vskip7mm
    \vrule height 0.1mm width 0.7\hsize
    \vskip1mm
    \csname headname\programname\endcsname\\
    10 ноября \yeari\,г. 
    \end{center}
    \end{minipage}
    \end{flushright}
    
    \begin{center}
    {\scshape
    \large ЗАДАНИЕ
    
    \normalsize на выпускную квалификационную работу}
    \end{center}
    
    \raggedright
    \noindent
    Обучающийся: {\assignfont \studentname}, группа \groupstudentname
    
    \vskip\itemskip
    \noindent
    Научный руководитель:
    {\assignfont \supervisername,
    \positionsupervisername%
    \ifx\degreesupervisername\emptymacro\else, \degreesupervisername\fi
    \ifx\ranksupervisername\emptymacro\else, \ranksupervisername\fi
    }
    
    \vskip\itemskip
    \noindent
    1. Тема ВКР: {\assignfont <<\titlename>>}
    
    \noindent
    утверждена приказом ректора от \orderdatename{} №\,\ordernumbername{}
    
    \vskip\itemskip
    \noindent
    2. Срок сдачи обучающимся ВКР: {\assignfont 25.05.\yearii}
    
    \vskip\itemskip
    \noindent
    3. Цель ВКР: {\assignfont \goalname}
    \end{minipage}%
    \newpage
    \noindent
    \begin{minipage}[t]{\pagewidth}%
    \raggedright
    \noindent
    4. Перечень задач, подлежащих разработке в ВКР:
    \assignfont
    \begin{enumerate}
    \let\task\tasktask
    \tasksname
    \end{enumerate}
    \end{minipage}%
    \hspace*{\pagesep}%
    \begin{minipage}[t]{\pagewidth}%
    \raggedright
    \noindent
    5. Перечень иллюстративного материала
    {\assignfont
    \ifx\imagesname\relax\\Отсутствует
    \else
        \begin{enumerate}[label=\arabic*)]
        \imagesname
        \end{enumerate}%
    \fi}
    
    \vskip\itemskip
    \noindent
    6. Консультанты по ВКР (с указанием относящихся к ним разделов ВКР)
    {\assignfont
    \ifx\advisersname\relax\\Отсутствуют
    \else
        \begin{enumerate}[label=\arabic*)]
        \advisersname
        \end{enumerate}%
    \fi}
    
    
    \vskip\itemskip
    \noindent
    7. Дата выдачи задания 01.11.\yeari
    
    \vskip10mm
    Подпись научного руководителя \hrulefill\space \briefsupervisername
    
    \vskip\itemskip
    \noindent
    8. Задание принял к исполнению 01.11.\yeari
    
    \vskip10mm
    Подпись обучающегося  \hrulefill\space \briefstudentname
    \end{minipage}%
    }
\fi %\ifbachelor

\ifmaster
    \def\makeassignment{%
    \linespread{1.03}
    \begin{center}
    {\bfseries\small ФГБОУ ВО «Тверской государственный университет»}
    
    \vskip1mm
    {\bfseries\small Факультет прикладной математики и кибернетики}
    \vskip3mm
    \hrule
    \vskip3mm
    Направление подготовки \csname specialityname\programname\endcsname
    
    \vskip2mm
    Профиль <<\csname programname\programname\endcsname>>
    \end{center}
    
    \begin{flushright}
    \begin{minipage}{.5\textwidth}
    \begin{center}
    УТВЕРЖДАЮ
    
    Руководитель ООП
    
    \vskip7mm
    \vrule height 0.1mm width 0.7\hsize
    \vskip1mm
    \csname headname\programname\endcsname\\
    10 ноября \yeari\,г. 
    \end{center}
    \end{minipage}
    \end{flushright}
    
    \begin{center}
    {\scshape
    \large ЗАДАНИЕ
    
    \normalsize на выпускную квалификационную работу\\
    (магистерскую диссертацию)}
    \end{center}
    
    \raggedright
    \noindent
    {\bfseries Обучающийся:} {\assignfont \studentname}, группа \groupstudentname
    
    \vskip\itemskip
    \noindent
    {\bfseries Научный руководитель:}
    {\assignfont \supervisername,
    \positionsupervisername%
    \ifx\degreesupervisername\emptymacro\else, \degreesupervisername\fi
    \ifx\ranksupervisername\emptymacro\else, \ranksupervisername\fi
    }
    
    \vskip\itemskip
    \noindent
    {\bfseries Тема:} {\assignfont <<\titlename>>}
    
    \noindent
    {\bfseries Утверждена приказом по университету} №\,\ordernumbername{} от \orderdatename{}
    
    \vskip\itemskip
    \noindent
    {\bfseries Цель работы:} {\assignfont \goalname}
    
    \vskip\itemskip
    \noindent
    {\bfseries Перечень (примерный) основных задач, которые должны быть рассмотрены в диссертации:}
    {\assignfont
    \begin{enumerate}
    \let\task\tasktask
    \tasksname
    \end{enumerate}
    }
    
    \noindent
    \vskip5mm
    Подпись научного руководителя \hrulefill\space \briefsupervisername
    
    Дата выдачи задания 01.11.\yeari
    
    \vskip\itemskip
    \noindent
    Задание принял к исполнению
    
    \noindent
    Подпись обучающегося  \hrulefill\space \briefstudentname
    
    \newpage
    \begin{center}
    {\bfseries Календарный график}\\
    выполнения ВКР (магистерской диссертации)
    \end{center}
    
    \noindent
    {\small {\bfseries Тема диссертации:} \titlename}
    
    \vskip\itemskip
    \begin{tabu}{|X[3,L]|X[1,C]|X[1,C]|}
    %\cline{1-3}
    \hline
    Выполняемая работа & Сроки выполнения & Отметка о выполнении\hskip0mm\strut\\
    \hline
    %\cline{1-3}
    Выбор темы ВКР\hskip0mm\strut & 30.09.\yeari\tablestrut& \strut\\
    \cline{1-3}
    Представление полностью оформленного задания на ВКР руководителю ООП\hskip0mm\strut & 01.11.\yeari\tablestrut& \strut\\
    \cline{1-3}
    Отчёт по НИР\hskip0mm\strut & 31.12.\yeari\tablestrut & \\
    \cline{1-3}
    Промежуточный отчёт\hskip0mm\strut & 31.03.\yearii\tablestrut & \\
    \cline{1-3}
    Доклад на конференции\hskip0mm\strut & 30.04.\yearii\tablestrut & \\
    \cline{1-3}
    Сдача научной публикации в печать\hskip0mm\strut & 12.05.\yearii\tablestrut & \\
    \cline{1-3}
    Сдача ВКР научному руководителю\hskip0mm\strut & 18.05.\yearii\tablestrut & \\
    \cline{1-3}
    Сдача ВКР руководителю ООП\hskip0mm\strut & 25.05.\yearii\tablestrut & \\
    \cline{1-3}
    \end{tabu}
    
    \vskip3mm
    Дата \hfill 01.11.\yeari
    
    \vskip10mm
    Подпись научного руководителя \hrulefill\space \briefsupervisername
    
    \vskip10mm
    Подпись обучающегося  \hrulefill\space \briefstudentname
    }
\fi %\ifmaster

\iftermpaper
    \def\makeassignment{%
    \linespread{1.03}
    \noindent
    \begin{minipage}[t]{\pagewidth}%
    ~
    \end{minipage}%
    \hspace*{\pagesep}%
    \begin{minipage}[t]{\pagewidth}%
    \begin{center}
    {\bfseries\small ФГБОУ ВО «Тверской государственный университет»}
    \vskip3mm
    \hrule
    \vskip3mm
    Направление \csname specialityname\programname\endcsname
    
    \vskip2mm
    ООП <<\csname programname\programname\endcsname>>
    \end{center}
    
    \begin{flushright}
    \begin{minipage}{.5\textwidth}
    \begin{center}
    УТВЕРЖДАЮ
    
    Руководитель ООП
    
    \vskip7mm
    \vrule height 0.1mm width 0.7\hsize
    \vskip1mm
    \csname headname\programname\endcsname\\
    01 ноября \yeari\,г. 
    \end{center}
    \end{minipage}
    \end{flushright}
    
    \begin{center}
    {\scshape
    \large ЗАДАНИЕ
    
    \normalsize на курсовую работу\\
    по дисциплине <<\subjectname>>
    }
    \end{center}
    
    \raggedright
    \noindent
    Обучающийся: {\assignfont \studentname}, группа \groupstudentname
    
    \vskip\itemskip
    \noindent
    Научный руководитель:
    {\assignfont \supervisername,
    \positionsupervisername%
    \ifx\degreesupervisername\emptymacro\else, \degreesupervisername\fi
    \ifx\ranksupervisername\emptymacro\else, \ranksupervisername\fi
    }
    
    \vskip\itemskip
    \noindent
    1. Тема курсовой работы: {\assignfont <<\titlename>>}
    
    \vskip\itemskip
    \noindent
    2. Срок сдачи курсовой работы: {\assignfont 25.05.\yearii}
    
    \vskip\itemskip
    \noindent
    3. Цель курсовой работы: {\assignfont \goalname}
    \end{minipage}%
    \newpage
    \noindent
    \begin{minipage}[t]{\pagewidth}%
    \raggedright
    \noindent
    4. Перечень задач, подлежащих разработке в курсовой работе:
    {\assignfont
    \begin{enumerate}
    \let\task\tasktask
    \tasksname
    \end{enumerate}
    }
    
    \vskip\itemskip
    \noindent
    5. Дата выдачи задания 31.10.\yeari
    
    \vskip10mm
    Подпись научного руководителя \hrulefill\space \briefsupervisername
    
    \vskip\itemskip
    \noindent
    6. Задание принял к исполнению 31.10.\yeari
    
    \vskip10mm
    Подпись обучающегося  \hrulefill\space \briefstudentname
    \end{minipage}%
    \hspace*{\pagesep}%
    \begin{minipage}[t]{\pagewidth}%
    \end{minipage}%
    }
\fi %\iftermpaper

\ifnotassign

    \ifessay
        \def\introduction{%
            \phantomsection
            \addcontentsline{toc}{section}{Введение}%
            \oldsection*{Введение}}
        \def\conclusion{%
            \phantomsection
            \addcontentsline{toc}{section}{Заключение}%
            \oldsection*{Заключение}}
    \else
        \def\introduction{%
            \phantomsection
            \addcontentsline{toc}{chapter}{Введение}%
            \chapter*{Введение}}
        \def\actuality{%
            %\phantomsection
            %\addcontentsline{toc}{section}{Актуальность}%
            \oldsection*{Актуальность}}
        \def\review{%
            %\phantomsection
            %\addcontentsline{toc}{section}{Обзор литературы}%
            \oldsection*{Обзор литературы}}
        \def\goalandtasks{%
            %\phantomsection
            %\addcontentsline{toc}{section}{Цели и задачи}%
            \oldsection*{Цель и задачи}
            \paragraph*{Цель работы.}
            \goalname
            \paragraph*{Задачи}
            \begin{enumerate}
            \let\task\tasktask
            \tasksname
            \end{enumerate}
            }
        \def\tools{%
            %\phantomsection
            %\addcontentsline{toc}{section}{Методы и средства}%
            \oldsection*{Методы и средства}}
        \def\results{%
            %\phantomsection
            %\addcontentsline{toc}{section}{Основные результаты}%
            \oldsection*{Основные результаты}
            \begin{enumerate}
            \let\task\taskresult
            \tasksname
            \end{enumerate}
            }
        \def\originality{%
            %\phantomsection
            %\addcontentsline{toc}{section}{Новизна}%
            \oldsection*{Новизна}}
        \def\approbation{%
            %\phantomsection
            %\addcontentsline{toc}{section}{Апробация}%
            \oldsection*{Апробация}}
        \def\structure{%
            %\phantomsection
            %\addcontentsline{toc}{section}{Структура работы}%
            \oldsection*{Структура работы}}
        \def\conclusion{%
            \phantomsection
            \addcontentsline{toc}{chapter}{Заключение}%
            \chapter*{Заключение}}
    \fi %\ifessay
    
    \def\maketitlepage{%
        \thispagestyle{empty}
        \begin{center}
        МИНИСТЕРСТВО НАУКИ И ВЫСШЕГО ОБРАЗОВАНИЯ РФ
        
        \vskip0.5ex
        Федеральное государственное бюджетное\\
        образовательное учреждение высшего образования\\
        <<Тверской государственный университет>>
        
        \vskip1.5ex
        \hrule
        
        \vskip1.5ex
        Факультет прикладной математики и кибернетики
        
        \vskip1.5ex
        Направление \csname specialityname\programname\endcsname
        
        \vskip1.5ex
        Профиль <<\csname programname\programname\endcsname>>
        
        \vfill
        {\large{\bfseries
        \ifsummary
            АВТОРЕФЕРАТ\\
            \mdseries выпускной квалификационной работы\\
            (магистерской диссертации)
        \else
            \iftermpaper
                КУРСОВАЯ РАБОТА%
            \else
                \ifessay
                    РЕФЕРАТ%
                \else
                    ВЫПУСКНАЯ КВАЛИФИКАЦИОННАЯ РАБОТА%
                \fi %\ifessay
            \fi %\iftermpaper
        \fi %\ifsummary
        }

        \ifpaper
            \vskip.5ex
            {\bfseries
            \ifmaster
                (МАГИСТЕРСКАЯ ДИССЕРТАЦИЯ)%
            \else
                \ifbachelor
                    (ВЫПУСКНАЯ РАБОТА БАКАЛАВРА)%
                \else
                    {\mdseries по дисциплине} <<\subjectname>>%
                \fi %\ifbachelor
            \fi %\ifmaster
            }
        \fi %\ifpaper
        
        \vskip1.5ex
        \ifpaper
            \Large
        \else
            \large
        \fi
        тема: {\bfseries
        <<\titlename>>\par}}
        \end{center}
        
        \vfill
        \noindent
        \begin{minipage}[b]{.4\textwidth}
        \iftermpaper\else\ifessay\else\ifsummary\else
            \small
            \begin{center}
            ДОПУЩЕН К ЗАЩИТЕ
            
            Руководитель ООП
            
            \vskip7mm
            \vrule height 0.1mm width 0.7\hsize
            \vskip1mm
            \csname headname\programname\endcsname
            
            \vskip5mm
            <<\uspace{10mm}>> \uspace{30mm} 20\uspace{10mm} г. 
            \end{center}
        \fi\fi\fi
        \end{minipage}%
        \hfill
        \begin{minipage}[b]{.4\textwidth}
        \raggedright
        {\bfseries Автор:}\\
        \studentname

        \ifpaper
            \vskip5mm
            Подпись \uspace{30mm}
        \fi
        
        \vskip4ex
        {\bfseries Научный руководитель:}\\
        {\supervisername%
        \ifx\degreesupervisername\emptymacro\else, \degreesupervisername\fi
        \ifx\ranksupervisername\emptymacro\else, \ranksupervisername\fi
        }

        \ifpaper
            \vskip5mm
            Подпись \uspace{30mm}
        \fi
        \end{minipage}
        
        \vfill
        \begin{center}
        Тверь\,---\,\yearii
        \end{center}
        \newpage
        \pagestyle{fancy}
        \iftermpaper\else\ifessay\else\ifpaper
            \ifx\englishabstractname\relax
                \error{There is no english abstract}
            \fi
            \begingroup
            \selectlanguage{english}%
            \begin{center}%
            \Large
            {\bfseries Abstract}
            
            \Large
            \mdseries
            \englishtitlename
            
            by
            
            \Large
            \englishstudentname
            \end{center}
            
            \vskip2ex
            \englishabstractname
            \selectlanguage{russian}
            \endgroup
            \newpage
        \fi\fi\fi
        \ifpaper
            \def\contentsname{Оглавление}
            \tableofcontents
            \ifessay
                \clearpage
            \fi %\ifessay
        \fi %\ifpaper
        }%of \maketitlepage
    
\fi %\ifnotassign
