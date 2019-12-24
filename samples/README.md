This folder contains sample synthetic data. Each subdirectory contains the same records, the difference between them being that files in the [mongoimport](mongoimport) directory can be used with the `mongoimport` MongoDB command to add them to a database, while the files in the [validJSON](validJSON) directory have been exported with the `--jsonArray` option, and therefore are valid JSON files that can be read by any JSON reader.

TL/DR: 
1. Use [validJSON](validJSON) files for general viewing
2. Use [mongoimport](mongoimport) files with `mongoimport`