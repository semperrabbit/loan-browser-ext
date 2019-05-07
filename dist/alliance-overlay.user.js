/*jshint multistr: true */

// ==UserScript==
// @name         Screeps alliance overlay
// @author esyrok, stybbe and SemperRabbit
// @namespace    https://screeps.com/
// @include      https://screeps.com/a/*
// @run-at       document-ready
// @grant none
// ==/UserScript==

/*
Special thanks to esyrok for the original code, stybbe for the chrome plugin leaderboard format,
tedivm, ags131 and akusnayesa for helping me with the LoAN CORS in python and ags131 again for
showing me the wonders of XMLHttpRequest.
*/

function declareLoAN(){
    window.LoANDeclared = true;
    window.loanBaseUrl = "http://www.leagueofautomatednations.com";

    window.getAllianceLogo = function(allianceKey) {
        let data = document.allianceData[allianceKey];
        if (data) {
            return loanBaseUrl + "/obj/" + data.logo;
        }
    };

    window.getAllianceColor = function(allianceKey) {
        return randomColor({
            luminosity: 'light',
            hue: 'random',
            seed: document.allianceData[allianceKey].name
        });
    };

    /* query for alliance data from the LOAN site */
    window.ensureAllianceData = function(callback) {
        if (document.allianceData) {
            if (callback) callback();
            return;
        }
        xhr=new XMLHttpRequest();
        xhr.open('GET', "https://www.leagueofautomatednations.com/alliances.js", true);
//        xhr.setRequestHeader('Accept-Encoding', 'identity');
        xhr.onreadystatechange=function() {
            if(xhr.readyState===XMLHttpRequest.DONE&&xhr.status===200) {
                document.allianceData = JSON.parse(xhr.responseText).query.results.json;
                console.log(document.allianceData);
                document.userAlliance = {};

                for (let allianceKey in document.allianceData) {
                    let alliance = document.allianceData[allianceKey];
                    for (let userIndex in alliance.members) {
                        let userName = alliance.members[userIndex];
                        document.userAlliance[userName] = allianceKey;
                    }
                }

                console.log("Alliance data loaded from LOAN.");
            }
        };
        xhr.send();
    };

    /* Stuff references to the alliance data in the world map object. Not clear whether this is actually doing useful things. */
    window.exposeAllianceDataForAngular = function() {
        let app = angular.element(document.body);
        let $timeout = angular.element('body').injector().get('$timeout');

        $timeout(()=>{
            let worldMapElem = angular.element($('.world-map'));
            let worldMap = worldMapElem.scope().WorldMap;

            worldMap.allianceData = document.allianceData;
            worldMap.userAlliance = document.userAlliance;

            recalculateAllianceOverlay();
        });

        for (let allianceKey in document.allianceData) {
            addStyle(".alliance-" + allianceKey + " { background-color: " + getAllianceColor(allianceKey) + " }");
            addStyle(".alliance-logo-3.alliance-" + allianceKey + " { background-image: url('" + getAllianceLogo(allianceKey) + "') }");
        }
    };

    /* inject a new CSS style */
    window.addStyle = function(css) {
        let head = document.head;
        if (!head) return;

        let style = document.createElement('style');
        style.type = 'text/css';
        style.innerHTML = css;

        head.appendChild(style);
    };

    window.generateCompiledElement = function(parent, content) {
        let $scope = parent.scope();
        let $compile = parent.injector().get("$compile");

        return $compile(content)($scope);
    };

    /* Bind the WorldMap alliance display option to the localStorage value */
    window.bindAllianceSetting = function() {
        let alliancesEnabled = localStorage.getItem("alliancesEnabled") !== "false";
        let worldMapElem = angular.element($('.world-map'));
        let worldMap = worldMapElem.scope().WorldMap;

        worldMap.displayOptions.alliances = alliancesEnabled;

        worldMap.toggleAlliances = function () {
            worldMap.displayOptions.alliances = !worldMap.displayOptions.alliances;
            localStorage.setItem("alliancesEnabled", worldMap.displayOptions.alliances);

            if (worldMap.displayOptions.alliances && !worldMap.userAlliances) {
                ensureAllianceData(exposeAllianceDataForAngular);
            } else {
                $('.alliance-logo').remove();
            }
        };

        worldMap.getAllianceName = function (userId) {
            if (!worldMap.userAlliance) return "Loading...";

            let userName = this.roomUsers[userId].username;
            let allianceKey = worldMap.userAlliance[userName];
            if (!allianceKey) return "None";

            return this.allianceData[allianceKey].name;
        };

        if (alliancesEnabled) {
            ensureAllianceData(exposeAllianceDataForAngular);
            recalculateAllianceOverlay();
        }
    };

    /* insert the alliance toggle into the map container layer */
    window.addAllianceToggle = function() {
        let content = "<md:button app-stop-click-propagation app-stop-propagation='mouseout mouseover mousemove' class='md-raised btn-units alliance-toggle' ng:class=\"{'md-primary': WorldMap.displayOptions.alliances, 'solitary': WorldMap.zoom !== 3}\" ng:click='WorldMap.toggleAlliances()' tooltip-placement='bottom' tooltip='Toggle alliances'><span>&#9733;</span></md:button>";

        addStyle("section.world-map .map-container .btn-units.alliance-toggle { right: 50px; font-size: 16px; padding: 4px; } section.world-map .map-container .btn-units.alliance-toggle.solitary { right: 10px; } section.world-map .map-container .layer-select { right: 90px; } ");

        let mapContainerElem = angular.element($('.map-container'));
        let compiledContent = generateCompiledElement(mapContainerElem, content);
        $(compiledContent).appendTo(mapContainerElem);
    };

    /* Add an "alliance" row to the room info overlay */
    window.addAllianceToInfoOverlay = function() {
        let content = "<div class='owner' ng:if='WorldMap.displayOptions.alliances && WorldMap.roomStats[MapFloatInfo.float.roomName].own'><label>Alliance:</label><span>{{WorldMap.getAllianceName(WorldMap.roomStats[MapFloatInfo.float.roomName].own.user)}}</span></div>";

        let mapFloatElem = angular.element($('.map-float-info'));
        let compiledContent = generateCompiledElement(mapFloatElem, content);
        $(compiledContent).insertAfter($(mapFloatElem).children('.owner')[0]);
    };

    window.recalculateAllianceOverlay = function() {
        let mapContainerElem = angular.element(".map-container");
        let scope = mapContainerElem.scope();
        let worldMap = scope.WorldMap;
        if (!worldMap.displayOptions.alliances || !worldMap.allianceData) return;

        function drawRoomAllianceOverlay(roomName, left, top) {
            let roomDiv = $('<div class="alliance-logo" id="' + roomName + '"></div>');
            let roomStats = worldMap.roomStats[roomName];
            if (roomStats && roomStats.own) {
                let userName = worldMap.roomUsers[roomStats.own.user].username;
                let allianceKey = worldMap.userAlliance[userName];
                if (allianceKey) {
                    $(roomDiv).addClass('alliance-' + allianceKey);

                    $(roomDiv).removeClass("alliance-logo-1 alliance-logo-2 alliance-logo-3");
                    $(roomDiv).css('left', left);
                    $(roomDiv).css('top', top);
                    $(roomDiv).addClass("alliance-logo-" + worldMap.zoom);

                    $(mapContainerElem).append(roomDiv);
                }
            }
        }

        let $location = mapContainerElem.injector().get("$location");
        if ($location.search().pos) {
            let roomPixels;
            let roomsPerSectorEdge;
            switch (worldMap.zoom) {
                case 1: { roomPixels = 20;  roomsPerSectorEdge = 10; break; }
                case 2: { roomPixels = 50;  roomsPerSectorEdge =  4; break; }
                case 3: { roomPixels = 150; roomsPerSectorEdge =  1; break; }
            }

            let posStr = $location.search().pos;
            if (!posStr) return;

            /*if (worldMap.zoom !== 3) return; // Alliance images are pretty ugly at high zoom. */

            for (var u = 0; u < worldMap.sectors.length; u++) {
                let sector = worldMap.sectors[u];
                if (!sector || !sector.pos) continue;

                if (worldMap.zoom === 3) {
                    /* we're at zoom level 3, only render one room */
                    drawRoomAllianceOverlay(sector.name, sector.left, sector.top);
                } else if (sector.rooms) {
                    /* high zoom, render a bunch of rooms */
                    let rooms = sector.rooms.split(",");
                    for (let x = 0; x < roomsPerSectorEdge; x++) {
                        for (let y = 0; y < roomsPerSectorEdge; y++) {
                            let roomName = rooms[x * roomsPerSectorEdge + y];
                            drawRoomAllianceOverlay(
                                roomName,
                                sector.left + x * roomPixels,
                                sector.top + y * roomPixels);
                        }
                    }
                }
            }
        }
    };

    window.pendingRedraws = 0;
    window.addSectorAllianceOverlay = function() {
        addStyle(".alliance-logo { position: absolute; z-index: 2; opacity: 0.4 }.alliance-logo-1 { width: 20px; height: 20px; }.alliance-logo-2 { width: 50px; height: 50px; }.alliance-logo-3 { width: 50px; height: 50px; background-size: 50px 50px; opacity: 0.8 }");

        let mapContainerElem = angular.element(".map-container");
        let scope = mapContainerElem.scope();

        let deferRecalculation = function () {
            /* remove alliance logos during redraws */
            $('.alliance-logo').remove();

            pendingRedraws++;
            setTimeout(() => {
                pendingRedraws--;
                if (pendingRedraws === 0) {
                    recalculateAllianceOverlay();
                }
            }, 500);
        };
        scope.$on("mapSectorsRecalced", deferRecalculation);
        scope.$on("mapStatsUpdated", deferRecalculation);
    };

    window.addAllianceColumnToLeaderboard = function() {
        function deferredLeaderboardLoad() {
            let leaderboardScope = angular.element('.leaderboard table').scope();
            if (leaderboardScope) {
                let rows = angular.element('.leaderboard table tr');
                let leaderboard = leaderboardScope.$parent.LeaderboardList;

                ensureAllianceData(() => {
                    for (let i = 0; i < rows.length; i++) {
                        if (i === 0) {
                            let playerElem = $(rows[i]).children('th:nth-child(2)');
                            $("<th class='alliance-leaderboard'>Alliance</th>").insertAfter(playerElem);
                        } else {
                            let playerElem = $(rows[i]).children('td:nth-child(2)');
                            let userId = leaderboard.list[i - 1].user;
                            let userName = leaderboard.users[userId].username;
                            let allianceKey = document.userAlliance[userName];
                            let allianceName = (allianceKey ? document.allianceData[allianceKey].name : "");
                            let allianceLogo = (document.allianceData[allianceKey] && document.allianceData[allianceKey].logo) ? getAllianceLogo(allianceKey) : "";

                            let str = "";
                            if(allianceName !== "") {
                                if(allianceLogo !== "") {
                                    str="<td class='alliance-leaderboard'><a target='_blank' href='http://www.leagueofautomatednations.com/a/"+allianceKey+"'><img src='"+allianceLogo+"' height='16' width='16'>"+allianceKey+"</a></td>";
                                } else {
                                    str="<td class='alliance-leaderboard'><a target='_blank' href='http://www.leagueofautomatednations.com/a/"+allianceKey+"'>"+allianceKey+"</a></td>";
                                }
                            } else{
                                str="<td class='alliance-leaderboard'></td>";
                            }

                            playerElem.after(str);
                        }
                    }
                    /*////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// adapted from https://github.com/stybbe/Screeps-SC/blob/master/modules/rank.leaderboard.js#L66 from @stybbe. Alliance colomn style from same player.
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////*/

                    $(".table.table-striped tbody tr th:last-child").css('text-align', 'right');
                    $(".table.table-striped tbody tr td:last-child").css('text-align', 'right');

                    if($("#th-gcl-h").length === 0) {
                        $(".table.table-striped tbody tr th:last-child").after('<th id="th-gcl-h">Last hour</th>');


                        for(let i = 0; i < rows.length - 1; i++){
                            let lastColumn = $(".table.table-striped tbody tr:nth-child(" + (i + 2) + ") td:last-child");

                            let newColumn = $("<td id='th-gcl-h-"+i+"'></td>");
                            lastColumn.after(newColumn);

                            (function(column) {
                                $.get("https://screeps.com/api/user/stats?id="+leaderboard.list[i].user+"&interval=8", function(result, err){
                                    var html = "";

                                    if (result){
                                        var amount = 0;

                                        if (window.location.href.includes("/power/")){
                                            amount = Math.round(result.stats.powerProcessed) || 0;
                                            column.text(""+amount);
                                        }else{
                                            amount = Math.round(result.stats.energyControl / 1000) || 0;
                                            column.text(amount+"K");
                                        }
                                    }
                                });
                            })(newColumn);
                        }
                    }

                    $(".table.table-striped tbody tr th:last-child").css('text-align', 'right');
                    $(".table.table-striped tbody tr td:last-child").css('text-align', 'right');

                    if($("#th-start-date").length === 0) {
                        $(".table.table-striped tbody tr th:last-child").after('<th id="th-start-date">Start date</th>');


                        for(let i = 0; i < rows.length - 1; i++){
                            let playerColumn = $(".table.table-striped tbody tr:nth-child(" + (i + 2) + ") td:nth-child(2)");
                            let lastColumn = $(".table.table-striped tbody tr:nth-child(" + (i + 2) + ") td:last-child");
                            let playerName = playerColumn[0].innerText.trim();

                            let newColumn = $("<td id='th-start-date-"+i+"'></td>");
                            lastColumn.after(newColumn);

                            (function(column, player) {
                                $.get("https://screeps.com/api/leaderboard/find?mode=world&username="+player, function(result, err){
                                    var html = "";

                                    if (result && result.list.length){
                                        var season = result.list[0].season;
                                        season = season.replace("-rel","");
                                        column.text(season);
                                    }
                                });
                            })(newColumn, playerName);
                        }
                    }
                });
            } else {
                setTimeout(deferredLeaderboardLoad, 100);
            }
        }

        setTimeout(deferredLeaderboardLoad, 100);
    };
}
/* Entry point */
window.executeLoAN = function(){
    if(!document.LoANDeclared)declareLoAN();
    window.ensureAllianceData();

    function injectScriptTag(url){
        return new Promise(function(good, bad){
            const xhr = new XMLHttpRequest();
            xhr.open('GET', url, true);
            xhr.onload = function () {
                if (xhr.status >= 200 && xhr.status < 300) {
                    let src=document.createElement('script');
                    src.lang='javascript';
                    src.innerHTML=xhr.responseText;
                    document.head.appendChild(src);
                    console.log('resp',xhr.responseText);
                    good({status: this.status, responseText: xhr.responseText});
                } else {
                    bad({ status: this.status, statusText: xhr.statusText });
                }
            };
            xhr.onerror = function () {
                bad({ status: this.status, statusText: xhr.statusText });
            };
            xhr.send();
        });
    };
    
    injectScriptTag("https://raw.githubusercontent.com/Esryok/screeps-browser-ext/master/screeps-browser-core.js").then(
    (()=>injectScriptTag("https://raw.githubusercontent.com/davidmerfield/randomColor/master/randomColor.js"))).then(
    function (result) {
        $(document).ready(() => {
            ScreepsAdapter.onViewChange((view) => {
                if (view === "worldMapEntered") {
                    ScreepsAdapter.$timeout(()=> {
                        bindAllianceSetting();
                        addAllianceToggle();
                        addAllianceToInfoOverlay();

                        addSectorAllianceOverlay();
                    });
                }
            });

            ScreepsAdapter.onHashChange((hash) => {
                var match = hash.match(/#!\/(.+?)\//);
                if (match && match.length > 1 && match[1] === "rank") {
                    let app = angular.element(document.body);
                    let search = app.injector().get("$location").search();
                    if (search.page) addAllianceColumnToLeaderboard();
                }
            });
        });
    });
};
executeLoAN();
