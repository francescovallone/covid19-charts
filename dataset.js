class BaseDataset {
    constructor(options) {
        this.prefix = options.prefix || options.name;
        this.path = options.path;
    }

    run() {
        var self = this;
        this.init_html();
        
        return this.load().then(function() {
            self.populate_html();            
        });
    }

    post_load_hook() {}

    series_label(column, value) {
        return value + " " + dash_to_space(column);
    }

    load() {
        var self = this;
        console.log("start fetching dataset " + self.prefix);

        return new Promise(function(resolve,reject) {
            fetch(self.REPOSITORY_URL + self.path)
            .then(function(response) {
                response.text().then(function(body) {
                    var rows = $.csv.toArrays(body);
                    var headers = rows[0];
                    rows = rows.filter(function(row){return row.length>= headers.length});
                    rows = rows.slice(1);
                    self.table = new Table(headers, rows);
                    
                    self.post_load_hook();

                    console.log("finished fetching dataset " + self.prefix);
                    return resolve();
                });
            })
        });    
    }

    init_html() {
        this.$button = $("button[name='" + this.prefix + "_add']"); 
        this.$button.prop("disabled", true);
    }

    add_series(options) {
        replay.push({
            dataset: this.prefix,
            options: options
        })
    }

    click() {
        // to be overridden        
    }
}

/*
 * database della protezione civile
 */

class DpcDataset extends BaseDataset {
    constructor(options) {
        super(options);
        this.fields = [
            "ricoverati_con_sintomi", 
            "terapia_intensiva", 
            "totale_ospedalizzati", 
            "isolamento_domiciliare", 
            "totale_attualmente_positivi", 
            "nuovi_attualmente_positivi", 
            "dimessi_guariti", 
            "deceduti", 
            "totale_casi", 
            "tamponi",

            // computed fields:
            "incremento deceduti",
            "incremento ricoverati_con_sintomi",
            "incremento terapia_intensiva",
            "incremento totale_ospedalizzati",
            "incremento isolamento_domiciliare",
            "incremento totale_attualmente_positivi",
            "incremento dimessi_guariti",
            "incremento totale_casi",
            "incremento tamponi",
            
            "ricoverati_con_sintomi / totale_casi", 
            "terapia_intensiva / totale_casi", 
            "totale_ospedalizzati / totale_casi", 
            "isolamento_domiciliare / totale_casi", 
            "totale_attualmente_positivi / totale_casi", 
            "nuovi_attualmente_positivi / totale_casi",
            "dimessi_guariti / totale_casi", 
            "deceduti / totale_casi",

            "totale_casi / tamponi", 
            "tamponi / popolazione",

            "totale_casi / popolazione",
            "ricoverati_con_sintomi / popolazione", 
            "terapia_intensiva / popolazione", 
            "totale_ospedalizzati / popolazione", 
            "isolamento_domiciliare / popolazione", 
            "totale_attualmente_positivi / popolazione", 
            "nuovi_attualmente_positivi / popolazione",
            "dimessi_guariti / popolazione", 
            "deceduti / popolazione",
            
        ];
        this.filter_column = options.filter_column || null;
        this.filter_name_column = options.filter_name_column || this.filter_column;
        this.REPOSITORY_URL = "https://raw.githubusercontent.com/pcm-dpc/COVID-19/master/";
    }

    init_html() {
        super.init_html();
        this.$column = $("select[name='" + this.prefix + "_column']");
        this.$select = this.filter_column ? $("select[name='" + this.prefix + "_" + this.filter_column) : null;
    }    
    
    populate_html() {
        var self = this;
        if (this.filter_column) {
            var pairs = this.table.get_column_distinct_pairs(this.filter_column, this.filter_name_column);
            pairs.sort(function(a,b){return a[1].localeCompare(b[1])});
            this.$select.find('option').remove();
            pairs.forEach(function(pair) {
                if (pair[0] === "04" && self.filter_name_column === "denominazione_regione") {
                    pair[1] = "Trentino Alto Adige"; // fix upstream data
                }
                self.$select.append("<option value='" + pair[0] + "'>" + pair[1] + "</option>");
            });
        }

        this.$column.find('option').remove();
        this.fields.forEach(function(field){
            self.$column.append("<option value='" + field + "'>" + dash_to_space(field) + "</option>");
        });

        this.$button.prop("disabled", false);

        this.$button.click(function(){self.click()});
    }

    add_series(options) {
        var column = options['column'];
        const increment_prefix = 'incremento ';
        var series = this.get_series_extended(column, options);
        series.label = this.series_label(series.label, options['value_name']);
        chart.add_series(series);
        super.add_series(options);
    }

    get_series_extended(column, options) {
        var series;
        const increment_prefix = "incremento ";
        var columns = column.split('/').map(function(x){return x.trim();});
        if (columns.length === 2) {
            series = this.get_series_extended(columns[0], options);
            if (columns[1] === "popolazione") {
                series.data_y = series.data_y.map(function(x) {return 100.0 * x / series.population;});
                series.label += " / popolazione";
            } else {
                var s = this.get_series_extended(columns[1], options);
                series.data_y = series.data_y.map(function(x, i) {return 100.0 * x / s.data_y[i]});
                series.label += " / " + columns[1];
            }
            series.y_axis = 'rate';
        } else if (column.startsWith(increment_prefix)) {
            column = column.slice(increment_prefix.length);
            series = this.get_series_extended(column, options); 
            var new_data_y = new Array(series.data_y.length);
            var last = 0;
            for (var i=0; i < new_data_y.length; ++i) {
                new_data_y[i] = series.data_y[i] - last;
                last = series.data_y[i];
            }
            series.data_y = new_data_y;
            series.label = "incremento " + series.label;
        } else {
            series = this.get_series(column, options);
        }
        return series;
    }

    get_series(column, options) {
        var subtable = this.table;
        var value = null;
        var value_name = null;
        var population;
        
        if (this.filter_column) {
            value = options['value'];
            value_name = options['value_name'];
            subtable = subtable.filter(this.filter_column, value);
            population = popolazione_regioni[value_name];
        } else {
            population = country_population['Italy'];
        }
        
        var data_x = [];
        var data_y = [];

        var x_col = subtable.headers.indexOf("data");
        var y_col = subtable.headers.indexOf(column);
        subtable.rows.forEach(function(row) {
            var l = data_x.length;
            var x = string_to_date(row[x_col]);
            var y = string_to_int(row[y_col]);
            if (l>0 && data_x[l-1].getTime() === x.getTime()) {
                data_y[l-1] += y;
            } else {
                data_x.push(x);
                data_y.push(y);
            }
        });

        var y_axis = 'count';
        
        var label = column;
        var series = new Series(data_x, data_y, label);
        series.population = population;
        series.y_axis = y_axis;
        return series;
    }

    click() {
        var options = {
            column: this.$column.children("option:selected").val()
        };
        if (this.filter_column) {
            options['value'] = this.$select.children("option:selected").val();
            options['value_name'] = this.$select.children("option:selected").text()
        }
        this.add_series(options)
        return options
    }
}

class DpcNazionaleDataset extends DpcDataset {
    constructor() {
        super({
            name: "italia",
            path: "dati-andamento-nazionale/dpc-covid19-ita-andamento-nazionale.csv"
        });
    }

    series_label(column, value) {
        return "Italia " + dash_to_space(column);
    }
}

class DpcRegioniDataset extends DpcDataset {
    constructor() {
        super({
            name: "regioni",
            path: "dati-regioni/dpc-covid19-ita-regioni.csv",
            filter_name_column: "denominazione_regione",
            filter_column: "codice_regione"
        });
    }
}

class DpcProvinceDataset extends DpcDataset {
    constructor() {
        super({
            name: "province",
            path: "dati-province/dpc-covid19-ita-province.csv",
            filter_name_column: "denominazione_provincia",
            filter_column: "codice_provincia"
        });
        this.fields = ['totale_casi', 'incremento totale_casi'];
    }

    post_load_hook() {
        var k = this.table.headers.indexOf("denominazione_provincia");
        var h = this.table.headers.indexOf("denominazione_regione");
        this.table.rows.forEach(function(row){
            row[k] = row[h]+": "+row[k];
        });
    }
}

class HopkinsDataset extends BaseDataset {
    constructor(options) {
        super(options);
        this.REPOSITORY_URL = "https://raw.githubusercontent.com/CSSEGISandData/COVID-19/master/";
        this.filter_column = options.filter_column || "Country/Region";
        this.subfilter_column = options.subfilter_column || "Province/State";
        this.fields = options.fields;
        this.first_time_column = 4;
        this.fields = options.fields;
    }

    init_html() {
        super.init_html();
        this.$select = $("select[name='" + this.prefix + "_filter']");
        this.$subselect = $("select[name='" + this.prefix + "_subfilter']");
        this.$column = $("select[name='" + this.prefix + "_column']");
    }
    
    populate_html() {
        var self = this;

        var obj = {};

        var i = this.table.headers.indexOf(this.filter_column);
        var j = this.table.headers.indexOf(this.subfilter_column);

        this.table.rows.forEach(function(row) {
            var value = row[i];
            var subvalue = row[j];
            if (!obj.hasOwnProperty(value)) obj[value] = {};
            if (subvalue !== "") {
                obj[value][subvalue] = true;
            }
        });

        this.$select.find("option").remove();
        var options = Object.getOwnPropertyNames(obj);
        options.sort();
        options.forEach(function(option) {
            self.$select.append("<option value='" + option + "'>" + option + "</option>");
        });

        this.$select.change(function() {
            var value = self.$select.children("option:selected").val();
            self.$subselect.find("option").remove();
            self.$subselect.append("<option value=''>-- all states --</option>");
            var options = Object.getOwnPropertyNames(obj[value]);
            options.sort();
            options.forEach(function(option) {
                self.$subselect.append("<option value='" + option + "'>" + option + "</option>");
            });
            self.$subselect.prop("disabled", false);
        });
        this.$select.change();

        this.$subselect.change(function() {
            var value = self.$subselect.children("option:selected").val();
            self.$column.prop('disabled', value !== "");
        });
        this.$subselect.change();

        this.$column.find("option").remove();
        this.fields.forEach(function(option) {
            self.$column.append("<option value='" + option + "'>" + option + "</option>");
        });

        this.$button.prop("disabled", false);
        this.$button.click(function(){self.click()});
    }

    add_series(options) {
        var column = options['column'] || 'count';
        var series = this.get_series_extended(column, options);
        chart.add_series(series);
        super.add_series(options);
    }

    get_series_extended(column, options) {
        var series;
        const increment_postfix = " increment";
        var columns = column.split('/').map(function(x) {return x.trim();});
        if (columns.length === 2) {
            series = this.get_series_extended(columns[0], options);
            // columns[1] should be "population"
            if (series.population > 0) {
                series.data_y = series.data_y.map(function(x) {return  100.0 * x / series.population;});
                series.label += ' percent'; 
                series.y_axis = 'rate';
            }
        } else if (column.endsWith(increment_postfix)) {
            column = column.slice(0, -increment_postfix.length);
            series = this.get_series_extended(column, options);
            var new_data_y = new Array(series.data_y.length);
            var last = 0;
            for (var i=0; i < new_data_y.length; ++i) {
                new_data_y[i] = series.data_y[i] - last;
                last = series.data_y[i];
            }
            series.data_y = new_data_y;
            series.label += increment_postfix;
        } else {
            series = this.get_series(column, options);
        }
        return series;
    }

    get_series(column, options) {
        var self = this;
        var value = options['value'];
        var subvalue = options['subvalue'];
        var subtable = this.table;
        var label = column + " " + value;
        var population = 0;
        
        subtable = subtable.filter(this.filter_column, value);
        if (subvalue === "") {
            population = country_population[value];
        } else {
            population = 0; // population of regions is unknown
            subtable = subtable.filter(this.subfilter_column, subvalue);
            label += " " + subvalue;
        }

        var data_x = this.table.headers.slice(this.first_time_column).map(anglo_to_date);
        var data_y = new Array(data_x.length)
        data_y.fill(0);

        subtable.rows.forEach(function(row){
            for (var i=0; i < data_y.length; i++) {
                data_y[i] += parseInt(row[i+self.first_time_column]);
            }
        });

        var series = new Series(data_x, data_y, label);
        series.y_axis = 'count';
        series.population = population;
        return series;
    }

    click() {
        var options = {
            value: this.$select.children("option:selected").val(),
            subvalue: this.$subselect.children("option:selected").val(),
            column: this.$column.children("option:selected").val()
        }
        this.add_series(options)
        return options
    }
}

class HopkinsConfirmedDataset extends HopkinsDataset {
    constructor() {
        super({
            name: "confirmed",
            path: "csse_covid_19_data/csse_covid_19_time_series/time_series_covid19_confirmed_global.csv",
            fields: ['confirmed', 'confirmed / population', 'confirmed increment'],
        });
    }
}

class HopkinsDeathsDataset extends HopkinsDataset {
    constructor() {
        super({
            name: "deaths",
            path: "csse_covid_19_data/csse_covid_19_time_series/time_series_covid19_deaths_global.csv",
            fields: ['deaths', 'deaths / population', 'deaths increment'],
        });
    }
}

class HopkinsRecoveredDataset extends HopkinsDataset {
    constructor() {
        super({
            name: "recovered",
            // path: "csse_covid_19_data/csse_covid_19_time_series/time_series_19-covid-Recovered.csv",
            path: "csse_covid_19_data/csse_covid_19_time_series/time_series_covid19_recovered_global.csv",
            fields: ['recovered', 'recovered / population', 'recovered increment'],
        });
    }
}


