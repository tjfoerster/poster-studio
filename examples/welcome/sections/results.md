<!-- The box "results" is as wide as the poster: in the layout map, its name stands twice in one row.
     Wide boxes set their text in two columns. On your own poster: your main findings. -->

## Results

**On your poster,** show your main findings as charts or tables, each with one sentence on what it shows.

**Charts from Excel:** save the sheet as *CSV UTF-8*, drag it onto the file list and write:

`::chart[Caption.]{src=resources/example-chart.csv}`

::chart[How long people look at a poster (made-up data).]{src=resources/example-chart.csv y="Visitors (%)"}

Each column of the sheet becomes a series; `type=line` or `type=pie` give other charts.

**Tables** come from CSV files the same way:

`::table[Caption.]{src=resources/paper-sizes.csv}`

::table[Paper sizes; to change the size, see poster.yaml.]{src=resources/paper-sizes.csv}
