var uzenet = document.getElementById('uzenet');
var szamlalo = 0;
var alszamlalo = 0;
var tombositve = [];
fotomb = [];
aktualisid = 0;
tarolo = 0;
tomb = [];
margo = 0;
mnebekatall = false;
massignatall = false;
elozoertek = '';
mentettkezdet = '';
mentettveg = '';
lentikiirszaml = 0;
firstTextGen = 0;

function fofunkcio() {
	$('.entitas').on('change', function() {
		$(this).find('option:first').attr('disabled', 'true');
		tomb[$(this).parent().attr('id')] = {};
		aktfoszam = Number($(this).parent().attr('id'));
		aktfoszampegy = aktfoszam + 1;
		// Ha ezt kivenném, kiakadna, mert a semmit próbálná meg törölni, rögtön az elején. Ezáltal csak akkor töröl, ha már van mit.
		if ($(this).parent().next()[0] != undefined) {
			// if ($('.entitas.e' + aktfoszampegy)[0] != undefined) {
			tomb[Number($(this).parent().attr('id'))] = {};
			szovegtorles(tomb);
		}
		$('#t' + aktfoszam).remove()[0];
		$('#b' + aktfoszam).remove()[0];
		$(this).addClass('kivalfont');
		if (this.value === 'Person') {
			alszamlalo = 0;
			$('#' + aktfoszam).append('<div id="t' + aktfoszam + '">');
			$('#t' + aktfoszam).append(
				'<form onsubmit="return false"><div class="form-row"><input class="col form-control mand col mb-2 mr-sm-2 veznev e' +
					aktfoszam +
					'_' +
					alszamlalo +
					'" type="text" placeholder="family name (mandatory)"><input class="col form-control mand col mb-2 mr-sm-2 kernev e' +
					aktfoszam +
					'_' +
					alszamlalo +
					'" type="text" placeholder="given name (mandatory)"><input class="col form-control col mb-2 mr-sm-2 szulev e' +
					aktfoszam +
					'_' +
					alszamlalo +
					'" type="text" placeholder="year of birth"><input class="col form-control col mb-2 mr-sm-2 szulhonap e' +
					aktfoszam +
					'_' +
					alszamlalo +
					'" type="text" placeholder="month of birth"><input class="col form-control col mb-2 mr-sm-2 szulnap e' +
					aktfoszam +
					'_' +
					alszamlalo +
					'" type="text" placeholder="day of birth"></div><div class="form-row"><input class="col form-control col mb-2 mr-sm-2 szulhely e' +
					aktfoszam +
					'_' +
					alszamlalo +
					'" type="text" placeholder="place of birth"><input class="col form-control col mb-2 mr-sm-2 anyjaneve e' +
					aktfoszam +
					'_' +
					alszamlalo +
					'" type="text" placeholder="maiden name of mother"><input class="col-5 form-control col mb-2 mr-sm-2 lakcim e' +
					aktfoszam +
					'_' +
					alszamlalo +
					'" type="text" placeholder="address"><input class="col form-control col mb-2 mr-sm-2 allampolgarsag e' +
					aktfoszam +
					'_' +
					alszamlalo +
					'" type="text" placeholder="citizenship"></div><div class="form-row"><input class="form-control col mb-2 mr-sm-2 pfree e' +
					aktfoszam +
					'_' +
					alszamlalo +
					'" type="text" placeholder="free text"><select class="custom-select mb-2 mr-2 col-1 sex e' +
					aktfoszam +
					'_' +
					alszamlalo +
					'"><option value="He/she">sex</option><option value="He">male</option><option value="She">female</option></select><button type="button" id="b' +
					aktfoszam +
					'" onclick="objektumtorles(this)" class="btn mr-2 btn-sm btn-outline-danger mb-2" data-toggle="tooltip" data-placement="top" title="Remove this object">-</button><button type="submit" class="gomb btn btn-primary mb-2" id="e' +
					aktfoszam +
					'_' +
					alszamlalo +
					'">Add</button></div></form>'
			);
			$(this).after(
				'<button type="button" id="b' +
					aktfoszam +
					'" onclick="objplusbutton(this.id)" class="btn mr-2 btn-info ml-2 mb-2 objplusbutton" data-toggle="tooltip" data-placement="top" title="Add another object of this type">+</button>'
			);
			$('[data-toggle="tooltip"]').tooltip();
			alszamlalo = alszamlalo + 1;
			$('#e' + aktfoszam + '_' + (alszamlalo - 1)).on('click', function(prop) {
				$(this).text('Update');
				prop.stopPropagation();
				aktfoszam = $(this).attr('id').slice(1, $(this).attr('id').indexOf('_'));
				aktualisid = $(this).attr('id');
				var veznev = $('.veznev.' + aktualisid).val();
				var kernev = $('.kernev.' + aktualisid).val();
				var szulev = $('.szulev.' + aktualisid).val();
				var szulhonap = $('.szulhonap.' + aktualisid).val();
				var szulnap = $('.szulnap.' + aktualisid).val();
				var szulhely = $('.szulhely.' + aktualisid).val();
				var anyjaneve = $('.anyjaneve.' + aktualisid).val();
				var lakcim = $('.lakcim.' + aktualisid).val();
				var allampolgarsag = $('.allampolgarsag.' + aktualisid).val();
				if (szulev != '') {
					var szulido = ', DOB: ' + szulnap + '/' + szulhonap + '/' + szulev;
				} else {
					var szulido = '';
				}
				if (szulhely != '') {
					var szulhelykiir = ', POB: ' + szulhely;
				} else {
					var szulhelykiir = '';
				}
				if (anyjaneve != '') {
					var anyjanevekiir = ", mother's maiden name: " + anyjaneve;
				} else {
					var anyjanevekiir = '';
				}
				if (lakcim != '') {
					var lakcimkiir = ', address: ' + lakcim;
				} else {
					var lakcimkiir = '';
				}
				if (allampolgarsag != '') {
					var allampolgarsagkiir = ', citizenship: ' + allampolgarsag;
				} else {
					var allampolgarsagkiir = '';
				}
				if ($('.pfree.' + aktualisid).val() != '') {
					var szemszabad = '. ' + $('.pfree.' + aktualisid).val();
				} else {
					var szemszabad = '';
				}
				var szemely =
					"<b><p class='font-weight-bold'>Concerning " +
					veznev.toUpperCase() +
					', ' +
					kernev +
					szulido +
					szulhelykiir +
					anyjanevekiir +
					lakcimkiir +
					allampolgarsagkiir +
					szemszabad +
					':</p></b>';
				tomb[aktfoszam].nev = szemely;

				addyesorno('buntetlen', 'No convictions ');
				addyesorno('folyamatban', 'Not a suspect ');
				addyesorno('ugyek', 'No police files ');
				addyesorno('ugyekrel', 'No relevant police files ');
				addyesorno('hatarnincs', 'No border crossings ');
				addyesorno('hatarvan', 'Border crossing(s) enclosed ');
				addyesorno('nincstars', 'Border cr.: no co-travellers ');
				addyesorno('nincsauto', 'No vehicles ');
				addyesorno('nincsceg', 'No companies ');
				addyesorno('photos', 'Photo(s) enclosed ');
				addyesorno('fingenc', 'Fingerprints enclosed ');
				addyesorno('notinprison', 'Not in prison ');
				addyesorno('noimmigr', 'No immigr. rec. ');

				feedyesorno('buntetlen', 'This person has no convictions.');
				feedyesorno('folyamatban', 'This individual is not a suspect in any ongoing criminal investigation.');
				feedyesorno('ugyek', 'He/she has no police files.');
				feedyesorno('ugyekrel', 'He/she has no relevant police files.');
				feedyesorno(
					'hatarnincs',
					'This individual has no registered border crossings. Please be advised that EU-citizens / vehicles driven by EU-citizens are not recorded in the border crossing’s database in my country.'
				);
				feedyesorno('hatarvan', 'Please find his/her border crossing records enclosed.');
				feedyesorno(
					'nincstars',
					'No co-travellers were registered related to his/her border crossing(s). Please take note that this does not fully exclude the possibility of the existence of potential co-travellers.'
				);
				feedyesorno('nincsauto', 'This person is not the registered owner of any vehicles in my country.');
				feedyesorno('nincsceg', 'This individual is not the registered owner of any companies in my country.');
				feedyesorno('photos', 'Please find his/her photo(s) attached.');
				feedyesorno('fingenc', 'Please find his/her fingerprints enclosed.');
				feedyesorno('notinprison', 'This individual is not in prison currenty in my country.');
				feedyesorno('noimmigr', 'Our searches revealed no immigration records of this person.');

				if ($('#t' + aktfoszam).find('.szemelyjellemzo')[0] === undefined) {
					$('#t' + aktfoszam).append(
						'<br><select id="szj' +
							aktfoszam +
							'_' +
							alszamlalo +
							'"class="szemelyjellemzo custom-select col-3 mt-2 mb-2 mb-2"><option value="valasztas">Add new feature</option><option value="perspart">Personal particulars</option><option value="conviction">Conviction</option><option value="ongoing">Ongoing procedure</option><option value="questioning">Questioned by the police</option><option value="control">Controlled by the police</option><option value="border">Border crossing</option><option value="case">Criminal case</option><option value="phone">Phone number</option><option value="documents">Document</option><option value="address">Address</option><option value="company">Company</option><option value="vehicle">Vehicle</option><option value="alias">Alias</option><option value="wanted">Wanted</option><option value="free">Free text</option></select><br>'
					);
				}
				function szemelyjellemzo() {
					$('.szemelyjellemzo').on('change', function() {
						sajatid = $(this).attr('id');
						var sajatalszam = sajatid.slice($(this).attr('id').indexOf('_') + 1, sajatid.length);
						sajatalszamszamkent = Number(sajatalszam);
						var sajatfoszam = sajatid.slice(3, $(this).attr('id').indexOf('_'));
						sajatfoszamszamkent = Number(sajatfoszam);
						sajatalszamotkovetoszam = sajatalszamszamkent + 1;
						torlendoform = '#form' + sajatfoszamszamkent + '_' + sajatalszamszamkent;
						$('#fb' + sajatfoszam + '_' + sajatalszam).remove()[0];
						if ($(torlendoform)[0] != undefined) {
							fotomb.forEach(function(k, kindex) {
								fotomb[kindex].forEach(function(m, mindex) {
									fotomb[kindex][mindex].forEach(function(h, hindex) {
										if (typeof h === 'object') {
											for (var i = 0; i < h.length; i++) {
												if (
													h[i].kapcs ===
													'e' + sajatfoszamszamkent + '_' + sajatalszamszamkent
												) {
													fotomb[kindex][mindex][hindex].splice(i, 1);
													szovegfeaturetorles(
														'e' + sajatfoszamszamkent + '_' + sajatalszamszamkent
													);
												}
											}
										}
									});
								});
							});
							$(torlendoform).remove()[0];
							alszamlalo = alszamlalo - 1;
						}
						if (this.value === 'perspart') {
							perspart();
						}
						if (this.value === 'conviction') {
							conviction();
						}
						if (this.value === 'ongoing') {
							ongoing();
						}
						if (this.value === 'questioning') {
							questioning();
						}
						if (this.value === 'control') {
							control();
						}
						if (this.value === 'border') {
							borderc();
						}
						if (this.value === 'phone') {
							phone();
						}
						if (this.value === 'documents') {
							documents();
						}
						if (this.value === 'address') {
							address();
						}
						if (this.value === 'company') {
							company();
						}
						if (this.value === 'case') {
							incase();
						}
						if (this.value === 'vehicle') {
							vehicle();
						}
						if (this.value === 'alias') {
							alias();
						}
						if (this.value === 'wanted') {
							wanted();
						}
						if (this.value === 'free') {
							free();
						}
						$(this).after(
							'<button type="button" id="fb' +
								sajatfoszamszamkent +
								'_' +
								(sajatalszamszamkent - 1) +
								'" onclick="featureplusbutton(this.id)" class="btn mr-2 btn-info ml-2 featplusbutton" data-toggle="tooltip" data-placement="top" title="Add another feature of this type">+</button>'
						);
						$('#form' + sajatfoszam + '_' + sajatalszam).find('input:first').focus();
						$('#form' + sajatfoszam + '_' + sajatalszam).find('textarea:first').focus();
						$('.szemelyjellemzo').off('change');
						$('[data-toggle="tooltip"]').tooltip();
						$(this).find('option:first').attr('disabled', 'true');
						szemelyjellemzo();
					});
				}
				szemelyjellemzo();
				szoveg(tomb);
			});
		}
		if (this.value === 'Person (inserted)') {
			alszamlalo = 0;
			$('#' + aktfoszam).append('<div id="t' + aktfoszam + '">');
			$('#t' + aktfoszam).append(
				'<form class="form-inline" onsubmit="return false"><legend class="col-form-label pt-0">You can insert persons directly from SIENA, simply by copying them from the top of the message (structured content area). You can insert multiple lines (one person / one line). Don´t change the original format. Example: <b>John SMITH, 12 April 1979 </b> </legend><textarea class="felvittek e' +
					aktfoszam +
					'_' +
					alszamlalo +
					' col pl-1" rows="6" placeholder="insert the persons here"></textarea><button type="button" id="b' +
					aktfoszam +
					'" onclick="objektumtorles(this)" class="btn mr-2 ml-2 inserted btn-outline-danger mb-2" data-toggle="tooltip" data-placement="top" title="Remove this object">-</button><button type="submit" class="gomb btn btn-primary mb-2 ml-2" id="e' +
					aktfoszam +
					'_' +
					alszamlalo +
					'">Add</button></form>'
			);
			$(this).after(
				'<button type="button" id="b' +
					aktfoszam +
					'" onclick="objplusbutton(this.id)" class="btn mr-2 btn-info ml-2 mb-2 objplusbutton" data-toggle="tooltip" data-placement="top" title="Add another object of this type">+</button>'
			);
			$('[data-toggle="tooltip"]').tooltip();
			alszamlalo = alszamlalo + 1;
			$('#e' + aktfoszam + '_' + (alszamlalo - 1)).on('click', function(prop) {
				prop.stopPropagation();
				aktfoszam = $(this).attr('id').slice(1, $(this).attr('id').indexOf('_'));
				aktualisid = $(this).attr('id');
				var tartalom = $('.felvittek.' + aktualisid).val();
				var atkodolt = encodeURIComponent(tartalom);
				var kiszedettsor = [];
				if (atkodolt.match(/%0A/g || []) === null) {
					kiszedettsor[0] = $('.felvittek.' + aktualisid).val();
				} else {
					var sorok = atkodolt.match(/%0A/g || []).length + 1;
					var regex = RegExp('%0A', 'g');
					var segedtomb;
					var elmentett = [];
					var valosindex = 0;
					while ((segedtomb = regex.exec(atkodolt)) !== null) {
						elmentett[valosindex] = regex.lastIndex;
						valosindex = valosindex + 1;
					}
					kiszedettsor[0] = atkodolt.slice(0, elmentett[0] - 3);
					kiszedettsor[elmentett.length] = atkodolt.slice(elmentett[elmentett.length - 1], atkodolt.length);
					if (sorok > 2) {
						for (var i = 1; i < elmentett.length; i++) {
							kiszedettsor[i] = atkodolt.slice(elmentett[i - 1], elmentett[i] - 3);
						}
					}
				}
				dekodoltsor = [];
				kiszedettsor.forEach(function(s, index) {
					if (s != '') {
						dekodoltsor.push(decodeURIComponent(s));
					}
				});
				dekodoltsor.forEach(function(d, index) {
					var vezetek = '';
					var kereszt = '';
					var vesszo = d.indexOf(',');
					if (vesszo != -1) {
						var teljesnev = d.slice(0, vesszo);
					} else {
						var teljesnev = d;
					}
					var szo = teljesnev.split(' ');
					szo.forEach(function(s, sindex) {
						var tech = 's:' + s + '.';
						if (tech === 's:.') {
							szo.splice(sindex, 1);
						}
					});
					szo.forEach(function(i, index) {
						if (i.charAt(1) === i.charAt(1).toUpperCase()) {
							vezetek = vezetek + ' ' + i;
						} else {
							kereszt = kereszt + ' ' + i;
						}
					});
					vezetek = vezetek.slice(1, vezetek.length);
					kereszt = kereszt.slice(1, kereszt.length);
					if (vesszo != -1) {
						var teljesszuletesi = d.slice(vesszo + 1, d.length);
					} else {
						var teljesszuletesi = '';
					}
					var reszszuletesi = teljesszuletesi.split(' ');
					reszszuletesi.forEach(function(s, sindex) {
						var tech = 's:' + s + '.';
						if (tech === 's:.') {
							reszszuletesi.splice(sindex, 1);
						}
					});
					var evszulet = reszszuletesi[2];
					var honapszulet = reszszuletesi[1];
					var napszulet = reszszuletesi[0];
					if (napszulet === undefined || honapszulet === undefined || evszulet === undefined) {
						napszulet = '';
						honapszulet = '';
						evszulet = '';
					}
					if (honapszulet.toUpperCase().indexOf('JANUARY') != -1) {
						honapszulet = '01';
					} else if (honapszulet.toUpperCase().indexOf('FEBRUARY') != -1) {
						honapszulet = '02';
					} else if (honapszulet.toUpperCase().indexOf('MARCH') != -1) {
						honapszulet = '03';
					} else if (honapszulet.toUpperCase().indexOf('APRIL') != -1) {
						honapszulet = '04';
					} else if (honapszulet.toUpperCase().indexOf('MAY') != -1) {
						honapszulet = '05';
					} else if (honapszulet.toUpperCase().indexOf('JUNE') != -1) {
						honapszulet = '06';
					} else if (honapszulet.toUpperCase().indexOf('JULY') != -1) {
						honapszulet = '07';
					} else if (honapszulet.toUpperCase().indexOf('AUGUST') != -1) {
						honapszulet = '08';
					} else if (honapszulet.toUpperCase().indexOf('SEPTEMBER') != -1) {
						honapszulet = '09';
					} else if (honapszulet.toUpperCase().indexOf('OCTOBER') != -1) {
						honapszulet = '10';
					} else if (honapszulet.toUpperCase().indexOf('NOVEMBER') != -1) {
						honapszulet = '11';
					} else if (honapszulet.toUpperCase().indexOf('DECEMBER') != -1) {
						honapszulet = '12';
					}
					pluszszemelyvegere(null, vezetek, kereszt, evszulet, honapszulet, napszulet);
				});
			});
		}
		if (this.value === 'Phone number') {
			alszamlalo = 0;
			$('#' + aktfoszam).append('<div id="t' + aktfoszam + '"></div>');
			$('#t' + aktfoszam).append(
				'<form class="" onsubmit="return false"><div class="form-row"><input class="form-control mand col div div mb-2 mr-sm-2 telszam e' +
					aktfoszam +
					'_' +
					alszamlalo +
					'" type="text" placeholder="phone number (mandatory)"><input class="form-control col div mb-2 mr-sm-2 tdate e' +
					aktfoszam +
					'_' +
					alszamlalo +
					'" type="text" placeholder="date of reg."></div><div class="form-row"><input class="form-control col-2 div mb-2 mr-sm-2 rugvez e' +
					aktfoszam +
					'_' +
					alszamlalo +
					'" type="text" placeholder="family name"><input class="form-control col-2 div mb-2 mr-sm-2 rugker e' +
					aktfoszam +
					'_' +
					alszamlalo +
					'" type="text" placeholder="given name"><input class="form-control col div mb-2 mr-sm-2 rugyear e' +
					aktfoszam +
					'_' +
					alszamlalo +
					'" type="text" placeholder="year of birth"><input class="form-control col div mb-2 mr-sm-2 rugmonth e' +
					aktfoszam +
					'_' +
					alszamlalo +
					'" type="text" placeholder="month of birth"><input class="form-control col div mb-2 mr-sm-2 rugday e' +
					aktfoszam +
					'_' +
					alszamlalo +
					'" type="text" placeholder="day of birth"><input class="form-control col-3 div mb-2 mr-sm-2 rugother e' +
					aktfoszam +
					'_' +
					alszamlalo +
					'" type="text" placeholder="other pers. data"><button type="button" id="b' +
					aktfoszam +
					'" onclick="koztesvegere(this)" class="ujsorbaszemely btn mr-2 btn-sm btn-info mb-2" data-toggle="tooltip" data-placement="top" title="Add this person as a new main object">@</button></div><div class="form-row"><input class="form-control col div mb-2 mr-sm-2 free e' +
					aktfoszam +
					'_' +
					alszamlalo +
					'" type="text" placeholder="free text"><button type="button" id="b' +
					aktfoszam +
					'" onclick="objektumtorles(this)" class="btn mr-2 btn-sm btn-outline-danger mb-2" data-toggle="tooltip" data-placement="top" title="Remove this object">-</button><button type="submit" class="gomb btn btn-primary mb-2" id="e' +
					aktfoszam +
					'_' +
					alszamlalo +
					'">Add</button></div></form>'
			);
			$(this).after(
				'<button type="button" id="b' +
					aktfoszam +
					'" onclick="objplusbutton(this.id)" class="btn mr-2 btn-info ml-2 mb-2 objplusbutton" data-toggle="tooltip" data-placement="top" title="Add another object of this type">+</button>'
			);
			$('[data-toggle="tooltip"]').tooltip();
			alszamlalo = alszamlalo + 1;
			$('#e' + aktfoszam + '_' + (alszamlalo - 1)).on('click', function(prop) {
				prop.stopPropagation();
				$(this).text('Update');
				aktfoszam = $(this).attr('id').slice(1, $(this).attr('id').indexOf('_'));
				aktualisid = $(this).attr('id');
				aktfoszam = $(this).attr('id').slice(1, $(this).attr('id').indexOf('_'));
				var telszemely = szemelygen();
				var normalizalt = $('.telszam.' + aktualisid).val().replace(/\D/g, '');
				var tphone = 'Regarding the phone number ' + normalizalt;
				if ($('.tdate.' + aktualisid).val() != '') {
					var tdate = ', that was registered in the database on ' + $('.tdate.' + aktualisid).val();
				} else {
					var tdate = '';
				}
				if (telszemely != '') {
					telszemely = ' belonging to ' + telszemely;
				}
				if ($('.free.' + aktualisid).val() != '') {
					var telszabad = '. ' + $('.free.' + aktualisid).val();
				} else {
					var telszabad = '';
				}
				var telszament =
					"<b><p class='font-weight-bold'>" + tphone + telszemely + tdate + telszabad + ':' + '</p></b>';
				tomb[aktfoszam].telo = telszament;

				addyesorno('notindb', 'Not in police database ');
				addyesorno('subcrprog', 'Subscriber in progress ');

				feedyesorno('notindb', 'This phone number cannot be found in the police databases of my country.');
				feedyesorno(
					'subcrprog',
					'Please be advised, that we forwarded your enquiry to the competent unit in order to determine the subscriber of the phone number by the provider. The result will be communicated to you asap.'
				);

				if ($('#t' + aktfoszam).find('.telojellemzo')[0] === undefined) {
					$('#t' + aktfoszam).append(
						'<br><select id="szj' +
							aktfoszam +
							'_' +
							alszamlalo +
							'"class="telojellemzo custom-select col-3 mt-2 mb-2"><option value="valasztas">Add new feature</option><option value="subscriber">Subscriber</option><option value="user">User</option><option value="free">Free text</option></select><br>'
					);
				}
				function telojellemzo() {
					$('.telojellemzo').on('change', function() {
						sajatid = $(this).attr('id');
						var sajatalszam = sajatid.slice($(this).attr('id').indexOf('_') + 1, sajatid.length);
						sajatalszamszamkent = Number(sajatalszam);
						var sajatfoszam = sajatid.slice(3, $(this).attr('id').indexOf('_'));
						sajatfoszamszamkent = Number(sajatfoszam);
						sajatalszamotkovetoszam = sajatalszamszamkent + 1;
						torlendoform = '#form' + sajatfoszamszamkent + '_' + sajatalszamszamkent;
						$('#fb' + sajatfoszam + '_' + sajatalszam).remove()[0];
						if ($(torlendoform)[0] != undefined) {
							fotomb.forEach(function(k, kindex) {
								fotomb[kindex].forEach(function(m, mindex) {
									fotomb[kindex][mindex].forEach(function(h, hindex) {
										if (typeof h === 'object') {
											for (var i = 0; i < h.length; i++) {
												if (
													h[i].kapcs ===
													'e' + sajatfoszamszamkent + '_' + sajatalszamszamkent
												) {
													fotomb[kindex][mindex][hindex].splice(i, 1);
													szovegfeaturetorles(
														'e' + sajatfoszamszamkent + '_' + sajatalszamszamkent
													);
												}
											}
										}
									});
								});
							});
							$(torlendoform).remove()[0];
							alszamlalo = alszamlalo - 1;
						}
						if (this.value === 'subscriber') {
							subscriber();
						}
						if (this.value === 'user') {
							user();
						}
						if (this.value === 'free') {
							telfree();
						}
						$(this).after(
							'<button type="button" id="fb' +
								sajatfoszamszamkent +
								'_' +
								(sajatalszamszamkent - 1) +
								'" onclick="featureplusbutton(this.id)" class="btn mr-2 btn-info ml-2 featplusbutton" data-toggle="tooltip" data-placement="top" title="Add another feature of this type">+</button>'
						);
						$('#form' + sajatfoszam + '_' + sajatalszam).find('input:first').focus();
						$('#form' + sajatfoszam + '_' + sajatalszam).find('textarea:first').focus();
						$('.telojellemzo').off('change');
						$('[data-toggle="tooltip"]').tooltip();
						$(this).find('option:first').attr('disabled', 'true');
						telojellemzo();
					});
				}
				telojellemzo();
				szoveg(tomb);
			});
		}
		if (this.value === 'Bank account') {
			alszamlalo = 0;
			$('#' + aktfoszam).append('<div id="t' + aktfoszam + '"></div>');
			$('#t' + aktfoszam).append(
				'<form class="" onsubmit="return false"><div class="form-row"><input class="form-control mand col div mb-2 mr-sm-2 banksz e' +
					aktfoszam +
					'_' +
					alszamlalo +
					'" type="text" placeholder="bank account nr. (mandatory)"><input class="form-control col div mb-2 mr-sm-2 bcountry e' +
					aktfoszam +
					'_' +
					alszamlalo +
					'" type="text" placeholder="country"><input class="form-control col div mb-2 mr-sm-2 bbank e' +
					aktfoszam +
					'_' +
					alszamlalo +
					'" type="text" placeholder="name of bank"></div><div class="form-row"><input class="form-control col-2 div mb-2 mr-sm-2 rugvez e' +
					aktfoszam +
					'_' +
					alszamlalo +
					'" type="text" placeholder="family/company name"><input class="form-control col-2 div mb-2 mr-sm-2 rugker e' +
					aktfoszam +
					'_' +
					alszamlalo +
					'" type="text" placeholder="given name"><input class="form-control col div mb-2 mr-sm-2 rugyear e' +
					aktfoszam +
					'_' +
					alszamlalo +
					'" type="text" placeholder="year of birth"><input class="form-control col div mb-2 mr-sm-2 rugmonth e' +
					aktfoszam +
					'_' +
					alszamlalo +
					'" type="text" placeholder="month of birth"><input class="form-control col div mb-2 mr-sm-2 rugday e' +
					aktfoszam +
					'_' +
					alszamlalo +
					'" type="text" placeholder="day of birth"><input class="form-control col-3 div mb-2 mr-sm-2 rugother e' +
					aktfoszam +
					'_' +
					alszamlalo +
					'" type="text" placeholder="other pers. data"><button type="button" id="b' +
					aktfoszam +
					'" onclick="koztesvegere(this)" class="ujsorbaszemely btn mr-2 btn-sm btn-info mb-2" data-toggle="tooltip" data-placement="top" title="Add this person as a new main object">@</button></div><div class="form-row"><input class="form-control col div mb-2 mr-sm-2 free e' +
					aktfoszam +
					'_' +
					alszamlalo +
					'" type="text" placeholder="free text"><button type="button" id="b' +
					aktfoszam +
					'" onclick="objektumtorles(this)" class="btn mr-2 btn-sm btn-outline-danger mb-2" data-toggle="tooltip" data-placement="top" title="Remove this object">-</button><button type="submit" class="gomb btn btn-primary mb-2" id="e' +
					aktfoszam +
					'_' +
					alszamlalo +
					'">Add</button></div></form>'
			);
			$(this).after(
				'<button type="button" id="b' +
					aktfoszam +
					'" onclick="objplusbutton(this.id)" class="btn mr-2 btn-info ml-2 mb-2 objplusbutton" data-toggle="tooltip" data-placement="top" title="Add another object of this type">+</button>'
			);
			$('[data-toggle="tooltip"]').tooltip();
			alszamlalo = alszamlalo + 1;
			$('#e' + aktfoszam + '_' + (alszamlalo - 1)).on('click', function(prop) {
				prop.stopPropagation();
				$(this).text('Update');
				aktfoszam = $(this).attr('id').slice(1, $(this).attr('id').indexOf('_'));
				aktualisid = $(this).attr('id');
				aktfoszam = $(this).attr('id').slice(1, $(this).attr('id').indexOf('_'));
				var banksztulaj = szemelygen();
				var balap = 'Regarding the bank account number ' + $('.banksz.' + aktualisid).val();
				if ($('.bcountry.' + aktualisid).val() != '') {
					var bcountry = ' (related country: ' + $('.bcountry.' + aktualisid).val() + ')';
				} else {
					var bcountry = '';
				}
				if ($('.bbank.' + aktualisid).val() != '') {
					var bbank = ' belonging to ' + $('.bbank.' + aktualisid).val();
				} else {
					var bbank = '';
				}
				if (banksztulaj != '') {
					banksztulaj = ', owned by ' + banksztulaj;
				} else {
					var bowner = '';
				}
				if ($('.free.' + aktualisid).val() != '') {
					var bankszabad = '. ' + $('.free.' + aktualisid).val();
				} else {
					var bankszabad = '';
				}
				var bankszoveg =
					"<b><p class='font-weight-bold'>" +
					balap +
					bbank +
					banksztulaj +
					bcountry +
					bankszabad +
					':' +
					'</p></b>';
				tomb[aktfoszam].bankszszam = bankszoveg;

				addyesorno('notindb', 'Not in police database ');
				addyesorno('eiokell', 'EIO is requested ');
				addyesorno('nincsdb', 'Not in police db - EIO ');
				feedyesorno(
					'notindb',
					'This bank account number cannot be found in the police databases of my country.'
				);
				feedyesorno(
					'eiokell',
					'Please be advised, that in order to carry out the measures in your enquiry - according to the applicable legislation - an EIO is kindly requested.'
				);
				feedyesorno(
					'nincsdb',
					'Please be advised, that this bank account number cannot be found in the police databases of my country. In order to identify the owner of the bank account - as it cannot be done via database searches - an EIO is kindly requested.'
				);

				if ($('#t' + aktfoszam).find('.bankszjellemzo')[0] === undefined) {
					$('#t' + aktfoszam).append(
						'<br><select id="szj' +
							aktfoszam +
							'_' +
							alszamlalo +
							'"class="bankszjellemzo custom-select col-3 mt-2 mb-2"><option value="valasztas">Add new feature</option><option value="incase">In case</option><option value="owner">Owner</option><option value="free">Free text</option></select><br>'
					);
				}
				function bankszjellemzo() {
					$('.bankszjellemzo').on('change', function() {
						sajatid = $(this).attr('id');
						var sajatalszam = sajatid.slice($(this).attr('id').indexOf('_') + 1, sajatid.length);
						sajatalszamszamkent = Number(sajatalszam);
						var sajatfoszam = sajatid.slice(3, $(this).attr('id').indexOf('_'));
						sajatfoszamszamkent = Number(sajatfoszam);
						sajatalszamotkovetoszam = sajatalszamszamkent + 1;
						torlendoform = '#form' + sajatfoszamszamkent + '_' + sajatalszamszamkent;
						$('#fb' + sajatfoszam + '_' + sajatalszam).remove()[0];
						if ($(torlendoform)[0] != undefined) {
							fotomb.forEach(function(k, kindex) {
								fotomb[kindex].forEach(function(m, mindex) {
									fotomb[kindex][mindex].forEach(function(h, hindex) {
										if (typeof h === 'object') {
											for (var i = 0; i < h.length; i++) {
												if (
													h[i].kapcs ===
													'e' + sajatfoszamszamkent + '_' + sajatalszamszamkent
												) {
													fotomb[kindex][mindex][hindex].splice(i, 1);
													szovegfeaturetorles(
														'e' + sajatfoszamszamkent + '_' + sajatalszamszamkent
													);
												}
											}
										}
									});
								});
							});
							$(torlendoform).remove()[0];
							alszamlalo = alszamlalo - 1;
						}
						if (this.value === 'owner') {
							owner();
						}
						if (this.value === 'incase') {
							bankincase();
						}
						if (this.value === 'free') {
							bankfree();
						}
						$(this).after(
							'<button type="button" id="fb' +
								sajatfoszamszamkent +
								'_' +
								(sajatalszamszamkent - 1) +
								'" onclick="featureplusbutton(this.id)" class="btn mr-2 btn-info ml-2 featplusbutton" data-toggle="tooltip" data-placement="top" title="Add another feature of this type">+</button>'
						);
						$('#form' + sajatfoszam + '_' + sajatalszam).find('input:first').focus();
						$('#form' + sajatfoszam + '_' + sajatalszam).find('textarea:first').focus();
						$('[data-toggle="tooltip"]').tooltip();
						$('.bankszjellemzo').off('change');
						$(this).find('option:first').attr('disabled', 'true');
						bankszjellemzo();
					});
				}
				bankszjellemzo();
				szoveg(tomb);
			});
		}
		if (this.value === 'Company') {
			alszamlalo = 0;
			$('#' + aktfoszam).append('<div id="t' + aktfoszam + '"></div>');
			$('#t' + aktfoszam).append(
				'<form class="" onsubmit="return false"><div class="form-row"><input class="form-control mand col div mb-2 mr-sm-2 compname e' +
					aktfoszam +
					'_' +
					alszamlalo +
					'" type="text" placeholder="company name (mandatory)"><input class="form-control col div mb-2 mr-sm-2 compseat e' +
					aktfoszam +
					'_' +
					alszamlalo +
					'" type="text" placeholder="company seat"><input class="form-control col div mb-2 mr-sm-2 compreg e' +
					aktfoszam +
					'_' +
					alszamlalo +
					'" type="text" placeholder="registry number"><input class="form-control col div mb-2 mr-sm-2 compbank e' +
					aktfoszam +
					'_' +
					alszamlalo +
					'" type="text" placeholder="bank account number(s)"></div><legend class="col-form-label pt-0">Personal data of the executive(s)</legend><div class="form-row"><input class="form-control col-2 div mb-2 mr-sm-2 rugvez e' +
					aktfoszam +
					'_' +
					alszamlalo +
					'" type="text" placeholder="family name"><input class="form-control col-2 div mb-2 mr-sm-2 rugker e' +
					aktfoszam +
					'_' +
					alszamlalo +
					'" type="text" placeholder="given name"><input class="form-control col div mb-2 mr-sm-2 rugyear e' +
					aktfoszam +
					'_' +
					alszamlalo +
					'" type="text" placeholder="year of birth"><input class="form-control col div mb-2 mr-sm-2 rugmonth e' +
					aktfoszam +
					'_' +
					alszamlalo +
					'" type="text" placeholder="month of birth"><input class="form-control col div mb-2 mr-sm-2 rugday e' +
					aktfoszam +
					'_' +
					alszamlalo +
					'" type="text" placeholder="day of birth"><input class="form-control col-3 div mb-2 mr-sm-2 rugother e' +
					aktfoszam +
					'_' +
					alszamlalo +
					'" type="text" placeholder="other pers. data"><button type="button" id="b' +
					aktfoszam +
					'" onclick="koztesvegere(this)" class="ujsorbaszemely btn mr-2 btn-sm btn-info mb-2" data-toggle="tooltip" data-placement="top" title="Add this person as a new main object">@</button><button type="button" id="b' +
					aktfoszam +
					'" onclick="megegyszemely(this)" class="szempluszgomb btn mr-2 btn-sm btn-info mb-2" data-toggle="tooltip" data-placement="top" title="Add a new person to this object">+</button></div><div class="form-row"><input class="form-control col div mb-2 mr-sm-2 free e' +
					aktfoszam +
					'_' +
					alszamlalo +
					'" type="text" placeholder="free text"><button type="button" id="b' +
					aktfoszam +
					'" onclick="objektumtorles(this)" class="btn mr-2 btn-sm btn-outline-danger mb-2" data-toggle="tooltip" data-placement="top" title="Remove this object">-</button><button type="submit" class="gomb btn btn-primary mb-2" id="e' +
					aktfoszam +
					'_' +
					alszamlalo +
					'">Add</button></div></form>'
			);
			$(this).after(
				'<button type="button" id="b' +
					aktfoszam +
					'" onclick="objplusbutton(this.id)" class="btn mr-2 btn-info ml-2 mb-2 objplusbutton" data-toggle="tooltip" data-placement="top" title="Add another object of this type">+</button>'
			);
			$('[data-toggle="tooltip"]').tooltip();
			alszamlalo = alszamlalo + 1;
			$('#e' + aktfoszam + '_' + (alszamlalo - 1)).on('click', function(prop) {
				prop.stopPropagation();
				$(this).text('Update');
				aktfoszam = $(this).attr('id').slice(1, $(this).attr('id').indexOf('_'));
				aktualisid = $(this).attr('id');
				aktfoszam = $(this).attr('id').slice(1, $(this).attr('id').indexOf('_'));
				var egyebszem = szemelygen();
				var compalap = 'Regarding the company ' + $('.compname.' + aktualisid).val();
				if ($('.compseat.' + aktualisid).val() != '') {
					var compseat = ', located at ' + $('.compseat.' + aktualisid).val();
				} else {
					var compseat = '';
				}
				if ($('.compreg.' + aktualisid).val() != '') {
					var compreg = ', with registry number ' + $('.compreg.' + aktualisid).val();
				} else {
					var compreg = '';
				}
				if ($('.compbank.' + aktualisid).val() != '') {
					var compbank =
						', that is the owner of the bank account number(s): ' + $('.compbank.' + aktualisid).val();
				} else {
					var compbank = '';
				}
				if (egyebszem != '') {
					egyebszem = ', owned by ' + egyebszem;
				} else {
					var egyebszem = '';
				}
				if ($('.free.' + aktualisid).val() != '') {
					var cegszabad = '. ' + $('.free.' + aktualisid).val();
				} else {
					var cegszabad = '';
				}
				var compszoveg =
					"<b><p class='font-weight-bold'>" +
					compalap +
					egyebszem +
					compseat +
					compreg +
					compbank +
					cegszabad +
					':' +
					'</p></b>';
				tomb[aktfoszam].cegalap = compszoveg;

				addyesorno('existcomp', 'Existing company ');
				addyesorno('nocomp', 'No such company ');
				addyesorno('ccenclosed ', 'Company certificate enclosed ');
				addyesorno('nopol', 'No police files ');
				addyesorno('norelpol', 'No relevant police files ');

				feedyesorno(
					'existcomp',
					'According to the company register in my country, this is an existing company.'
				);
				feedyesorno(
					'nocomp',
					'According to the company register, there is no company in my country with this name.'
				);
				feedyesorno(
					'ccenclosed',
					'Please find the company certificate - containing all the available data, such as the personal particulars of the owner(s) - attached in English.'
				);
				feedyesorno('nopol', 'This company did not emerge in any police case in my country.');
				feedyesorno('norelpol', 'This company has no relevant police case in my country.');

				if ($('#t' + aktfoszam).find('.cegjellemzo')[0] === undefined) {
					$('#t' + aktfoszam).append(
						'<br><select id="szj' +
							aktfoszam +
							'_' +
							alszamlalo +
							'"class="cegjellemzo custom-select col-3 mt-2 mb-2"><option value="valasztas">Add new feature</option><option value="members">Members</option><option value="bankacc">Bank accounts</option><option value="incase">In case </option><option value="free">Free text</option></select><br>'
					);
				}
				function cegjellemzo() {
					$('.cegjellemzo').on('change', function() {
						sajatid = $(this).attr('id');
						var sajatalszam = sajatid.slice($(this).attr('id').indexOf('_') + 1, sajatid.length);
						sajatalszamszamkent = Number(sajatalszam);
						var sajatfoszam = sajatid.slice(3, $(this).attr('id').indexOf('_'));
						sajatfoszamszamkent = Number(sajatfoszam);
						sajatalszamotkovetoszam = sajatalszamszamkent + 1;
						torlendoform = '#form' + sajatfoszamszamkent + '_' + sajatalszamszamkent;
						$('#fb' + sajatfoszam + '_' + sajatalszam).remove()[0];
						if ($(torlendoform)[0] != undefined) {
							fotomb.forEach(function(k, kindex) {
								fotomb[kindex].forEach(function(m, mindex) {
									fotomb[kindex][mindex].forEach(function(h, hindex) {
										if (typeof h === 'object') {
											for (var i = 0; i < h.length; i++) {
												if (
													h[i].kapcs ===
													'e' + sajatfoszamszamkent + '_' + sajatalszamszamkent
												) {
													fotomb[kindex][mindex][hindex].splice(i, 1);
													szovegfeaturetorles(
														'e' + sajatfoszamszamkent + '_' + sajatalszamszamkent
													);
												}
											}
										}
									});
								});
							});
							$(torlendoform).remove()[0];
							alszamlalo = alszamlalo - 1;
						}
						if (this.value === 'members') {
							members();
						}
						if (this.value === 'bankacc') {
							cegszamla();
						}
						if (this.value === 'incase') {
							compincase();
						}
						if (this.value === 'free') {
							cegfree();
						}
						$(this).after(
							'<button type="button" id="fb' +
								sajatfoszamszamkent +
								'_' +
								(sajatalszamszamkent - 1) +
								'" onclick="featureplusbutton(this.id)" class="btn mr-2 btn-info ml-2 featplusbutton" data-toggle="tooltip" data-placement="top" title="Add another feature of this type">+</button>'
						);
						$('#form' + sajatfoszam + '_' + sajatalszam).find('input:first').focus();
						$('#form' + sajatfoszam + '_' + sajatalszam).find('textarea:first').focus();
						$('[data-toggle="tooltip"]').tooltip();
						$('.cegjellemzo').off('change');
						$(this).find('option:first').attr('disabled', 'true');
						cegjellemzo();
					});
				}
				cegjellemzo();
				szoveg(tomb);
			});
		}
		if (this.value === 'Vehicle') {
			alszamlalo = 0;
			$('#' + aktfoszam).append('<div id="t' + aktfoszam + '"></div>');
			$('#t' + aktfoszam).append(
				'<form class="" onsubmit="return false"><div class="form-row"><input class="form-control mand col div mb-2 mr-sm-2 numbpl e' +
					aktfoszam +
					'_' +
					alszamlalo +
					'" type="text" placeholder="number plate (mandatory)"><input class="form-control col div mb-2 mr-sm-2 chassis e' +
					aktfoszam +
					'_' +
					alszamlalo +
					'" type="text" placeholder="chassis number"><input class="form-control col div mb-2 mr-sm-2 vtype e' +
					aktfoszam +
					'_' +
					alszamlalo +
					'" type="text" placeholder="type (made)"><input class="form-control col div mb-2 mr-sm-2 vcolour e' +
					aktfoszam +
					'_' +
					alszamlalo +
					'" type="text" placeholder="colour"></div><div class="form-row"><input class="form-control col-2 div mb-2 mr-sm-2 rugvez e' +
					aktfoszam +
					'_' +
					alszamlalo +
					'" type="text" placeholder="family name"><input class="form-control col-2 div mb-2 mr-sm-2 rugker e' +
					aktfoszam +
					'_' +
					alszamlalo +
					'" type="text" placeholder="given name"><input class="form-control col div mb-2 mr-sm-2 rugyear e' +
					aktfoszam +
					'_' +
					alszamlalo +
					'" type="text" placeholder="year of birth"><input class="form-control col div mb-2 mr-sm-2 rugmonth e' +
					aktfoszam +
					'_' +
					alszamlalo +
					'" type="text" placeholder="month of birth"><input class="form-control col div mb-2 mr-sm-2 rugday e' +
					aktfoszam +
					'_' +
					alszamlalo +
					'" type="text" placeholder="day of birth"><input class="form-control col-3 div mb-2 mr-sm-2 rugother e' +
					aktfoszam +
					'_' +
					alszamlalo +
					'" type="text" placeholder="other pers. data"><button type="button" id="b' +
					aktfoszam +
					'" onclick="koztesvegere(this)" class="ujsorbaszemely btn mr-2 btn-sm btn-info mb-2" data-toggle="tooltip" data-placement="top" title="Add this person as a new main object">@</button></div><div class="form-row"><input class="form-control col div mb-2 mr-sm-2 vfree e' +
					aktfoszam +
					'_' +
					alszamlalo +
					'" type="text" placeholder="free text"><button type="button" id="b' +
					aktfoszam +
					'" onclick="objektumtorles(this)" class="btn mr-2 btn-sm btn-outline-danger mb-2" data-toggle="tooltip" data-placement="top" title="Remove this object">-</button><button type="submit" class="gomb btn btn-primary mb-2" id="e' +
					aktfoszam +
					'_' +
					alszamlalo +
					'">Add</button></div></form>'
			);
			$(this).after(
				'<button type="button" id="b' +
					aktfoszam +
					'" onclick="objplusbutton(this.id)" class="btn mr-2 btn-info ml-2 mb-2 objplusbutton" data-toggle="tooltip" data-placement="top" title="Add another object of this type">+</button>'
			);
			$('[data-toggle="tooltip"]').tooltip();
			alszamlalo = alszamlalo + 1;
			$('#e' + aktfoszam + '_' + (alszamlalo - 1)).on('click', function(prop) {
				prop.stopPropagation();
				$(this).text('Update');
				aktfoszam = $(this).attr('id').slice(1, $(this).attr('id').indexOf('_'));
				aktualisid = $(this).attr('id');
				aktfoszam = $(this).attr('id').slice(1, $(this).attr('id').indexOf('_'));
				var kapcsszemely = szemelygen();
				var vehalap = 'Regarding the vehicle with the number plate ' + $('.numbpl.' + aktualisid).val();
				if ($('.chassis.' + aktualisid).val() != '') {
					var chassis = ', chassis number ' + $('.chassis.' + aktualisid).val();
				} else {
					var chassis = '';
				}
				if ($('.vtype.' + aktualisid).val() != '') {
					var vtype = ', type (make) ' + $('.vtype.' + aktualisid).val();
				} else {
					var vtype = '';
				}
				if ($('.vcolour.' + aktualisid).val() != '') {
					var vcolour = ', colour: ' + $('.vcolour.' + aktualisid).val();
				} else {
					var vcolour = '';
				}
				if (kapcsszemely != '') {
					var kapcsszemely = ', related to ' + kapcsszemely;
				}
				if ($('.vfree.' + aktualisid).val() != '') {
					var gkszabad = '. ' + $('.vfree.' + aktualisid).val();
				} else {
					var gkszabad = '';
				}
				var vehszoveg =
					"<b><p class='font-weight-bold'>" +
					vehalap +
					chassis +
					vtype +
					vcolour +
					kapcsszemely +
					gkszabad +
					':' +
					'</p></b>';
				tomb[aktfoszam].jarmualap = vehszoveg;

				addyesorno('notinhudb ', 'Not in nat. db ');
				addyesorno('nobordc ', 'No border crossings ');
				addyesorno('hatarvan', 'Border crossings enc. ');
				addyesorno('nopol', 'No police files ');
				addyesorno('nuszprogress', 'ANPR in progress ');
				addyesorno('nuszenclosed', 'ANPR enclosed ');
				addyesorno('nonusz', 'ANPR negative ');
				feedyesorno(
					'notinhudb',
					'This vehicle with the given particulars cannot be found in the databases of my country.'
				);
				feedyesorno(
					'nobordc',
					'This vehicle has no registered border crossings (within the requested period). Please take note, that vehicles with EU number plates and driven by EU-citizens are not registered.'
				);
				feedyesorno('hatarvan', 'Please find its border crossing records enclosed.');
				feedyesorno(
					'nopol',
					'This vehicle did not emerge in any police case in my country, it has no recorded police controls (within the requested period).'
				);
				feedyesorno(
					'nuszprogress',
					'Please be advised, that we forwarded your enquiry to the competent unit in order to determine the movements of the vehicle with the given number plate in my country. The result will be communicated to you asap.'
				);
				feedyesorno(
					'nuszenclosed',
					'Please find the results of the automatic number plate recognition system attached.'
				);
				feedyesorno(
					'nonusz',
					'Our search in the ANPR (Automatic Number-Plate Recognition) system resulted no hits regarding this vehicle.'
				);

				if ($('#t' + aktfoszam).find('.jarmujellemzo')[0] === undefined) {
					$('#t' + aktfoszam).append(
						'<br><select id="szj' +
							aktfoszam +
							'_' +
							alszamlalo +
							'"class="jarmujellemzo custom-select col-3 mt-2 mb-2"><option value="valasztas">Add new feature</option><option value="border">Border control</option><option value="owner">Owner</option><option value="control">Controlled by the police</option><option value="free">Free text</option></select><br>'
					);
				}
				function jarmujellemzo() {
					$('.jarmujellemzo').on('change', function() {
						sajatid = $(this).attr('id');
						var sajatalszam = sajatid.slice($(this).attr('id').indexOf('_') + 1, sajatid.length);
						sajatalszamszamkent = Number(sajatalszam);
						var sajatfoszam = sajatid.slice(3, $(this).attr('id').indexOf('_'));
						sajatfoszamszamkent = Number(sajatfoszam);
						sajatalszamotkovetoszam = sajatalszamszamkent + 1;
						torlendoform = '#form' + sajatfoszamszamkent + '_' + sajatalszamszamkent;
						$('#fb' + sajatfoszam + '_' + sajatalszam).remove()[0];
						if ($(torlendoform)[0] != undefined) {
							fotomb.forEach(function(k, kindex) {
								fotomb[kindex].forEach(function(m, mindex) {
									fotomb[kindex][mindex].forEach(function(h, hindex) {
										if (typeof h === 'object') {
											for (var i = 0; i < h.length; i++) {
												if (
													h[i].kapcs ===
													'e' + sajatfoszamszamkent + '_' + sajatalszamszamkent
												) {
													fotomb[kindex][mindex][hindex].splice(i, 1);
													szovegfeaturetorles(
														'e' + sajatfoszamszamkent + '_' + sajatalszamszamkent
													);
												}
											}
										}
									});
								});
							});
							$(torlendoform).remove()[0];
							alszamlalo = alszamlalo - 1;
						}
						if (this.value === 'border') {
							vehborder();
						}
						if (this.value === 'control') {
							vehcontrol();
						}
						if (this.value === 'owner') {
							vehowner();
						}
						if (this.value === 'free') {
							vehfree();
						}
						$(this).after(
							'<button type="button" id="fb' +
								sajatfoszamszamkent +
								'_' +
								(sajatalszamszamkent - 1) +
								'" onclick="featureplusbutton(this.id)" class="btn mr-2 btn-info ml-2 featplusbutton" data-toggle="tooltip" data-placement="top" title="Add another feature of this type">+</button>'
						);
						$('#form' + sajatfoszam + '_' + sajatalszam).find('input:first').focus();
						$('#form' + sajatfoszam + '_' + sajatalszam).find('textarea:first').focus();
						$('.jarmujellemzo').off('change');
						$(this).find('option:first').attr('disabled', 'true');
						jarmujellemzo();
						$('[data-toggle="tooltip"]').tooltip();
					});
				}
				jarmujellemzo();
				szoveg(tomb);
			});
		}
		if (this.value === 'Document') {
			alszamlalo = 0;
			$('#' + aktfoszam).append('<div id="t' + aktfoszam + '"></div>');
			$('#t' + aktfoszam).append(
				'<form class="" onsubmit="return false"><div class="form-row"><select class="custom-select mand col-3 mb-2 mr-2 dtype e' +
					aktfoszam +
					'_' +
					alszamlalo +
					'"><option value="valasztas">Type (mandatory)</option><option value="passport">Passport</option><option value="ID card">ID card</option><option value="Driving license">Driving license</option><option value="Residence permit">Residence permit</option></select><input class="form-control col div mb-2 mr-sm-2 idnumber e' +
					aktfoszam +
					'_' +
					alszamlalo +
					'" type="text" placeholder="ident. number of document"><input class="form-control col div mb-2 mr-sm-2 dissued e' +
					aktfoszam +
					'_' +
					alszamlalo +
					'" type="text" placeholder="issued by"><input class="form-control col div mb-2 mr-sm-2 dvalid e' +
					aktfoszam +
					'_' +
					alszamlalo +
					'" type="text" placeholder="valid until"></div><div class="form-row"><input class="form-control col-2 div mb-2 mr-sm-2 rugvez e' +
					aktfoszam +
					'_' +
					alszamlalo +
					'" type="text" placeholder="family name"><input class="form-control col-2 div mb-2 mr-sm-2 rugker e' +
					aktfoszam +
					'_' +
					alszamlalo +
					'" type="text" placeholder="given name"><input class="form-control col div mb-2 mr-sm-2 rugyear e' +
					aktfoszam +
					'_' +
					alszamlalo +
					'" type="text" placeholder="year of birth"><input class="form-control col div mb-2 mr-sm-2 rugmonth e' +
					aktfoszam +
					'_' +
					alszamlalo +
					'" type="text" placeholder="month of birth"><input class="form-control col div mb-2 mr-sm-2 rugday e' +
					aktfoszam +
					'_' +
					alszamlalo +
					'" type="text" placeholder="day of birth"><input class="form-control col-3 div mb-2 mr-sm-2 rugother e' +
					aktfoszam +
					'_' +
					alszamlalo +
					'" type="text" placeholder="other pers. data"><button type="button" id="b' +
					aktfoszam +
					'" onclick="koztesvegere(this)" class="ujsorbaszemely btn mr-2 btn-sm btn-info mb-2" data-toggle="tooltip" data-placement="top" title="Add this person as a new main object">@</button></div><div class="form-row"><input class="form-control col div mb-2 mr-sm-2 dfree e' +
					aktfoszam +
					'_' +
					alszamlalo +
					'" type="text" placeholder="free text"><button type="button" id="b' +
					aktfoszam +
					'" onclick="objektumtorles(this)" class="btn mr-2 btn-sm btn-outline-danger mb-2" data-toggle="tooltip" data-placement="top" title="Remove this object">-</button><button type="submit" class="gomb btn btn-primary mb-2" id="e' +
					aktfoszam +
					'_' +
					alszamlalo +
					'">Add</button></div></form>'
			);
			alszamlalo = alszamlalo + 1;
			$(this).after(
				'<button type="button" id="b' +
					aktfoszam +
					'" onclick="objplusbutton(this.id)" class="btn mr-2 btn-info ml-2 mb-2 objplusbutton" data-toggle="tooltip" data-placement="top" title="Add another object of this type">+</button>'
			);
			$('[data-toggle="tooltip"]').tooltip();
			$('#e' + aktfoszam + '_' + (alszamlalo - 1)).on('click', function(prop) {
				prop.stopPropagation();
				$(this).text('Update');
				aktfoszam = $(this).attr('id').slice(1, $(this).attr('id').indexOf('_'));
				aktualisid = $(this).attr('id');
				aktfoszam = $(this).attr('id').slice(1, $(this).attr('id').indexOf('_'));
				var dokszemely = szemelygen();
				var docalap = 'Concerning the personal document (type - ' + $('.dtype.' + aktualisid).val() + ')';
				if ($('.idnumber.' + aktualisid).val() != '') {
					var idnumber = ', number ' + $('.idnumber.' + aktualisid).val();
				} else {
					var idnumber = '';
				}
				if (dokszemely != '') {
					var dokszemely = ', issued to ' + dokszemely;
				}
				if ($('.dissued.' + aktualisid).val() != '') {
					var dissued = ', issued by ' + $('.dissued.' + aktualisid).val();
				} else {
					var dissued = '';
				}
				if ($('.dvalid.' + aktualisid).val() != '') {
					var dvalid = ', valid until ' + $('.dvalid.' + aktualisid).val();
				} else {
					var dvalid = '';
				}
				if ($('.dfree.' + aktualisid).val() != '') {
					var dokszabad = '. ' + $('.dfree.' + aktualisid).val();
				} else {
					var dokszabad = '';
				}
				var docszoveg =
					"<b><p class='font-weight-bold'>" +
					docalap +
					idnumber +
					dokszemely +
					dissued +
					dvalid +
					dokszabad +
					':' +
					'</p></b>';
				tomb[aktfoszam].igazolvanyalap = docszoveg;

				addyesorno('existing', 'Existing ');
				addyesorno('notexisting', 'Not existing ');
				feedyesorno('existing', 'The document with the mentioned number is indeed existing.');
				feedyesorno(
					'notexisting',
					'According to the register, the document with the given number is not existing.'
				);

				if ($('#t' + aktfoszam).find('.docjellemzo')[0] === undefined) {
					$('#t' + aktfoszam).append(
						'<br><select id="szj' +
							aktfoszam +
							'_' +
							alszamlalo +
							'"class="custom-select col-3 docjellemzo mt-2 mb-2"><option value="valasztas">Add new feature</option><option value="issuedto">Issued to</option><option value="issuedon">Valid/issued on</option><option value="lost/stolen">Lost/stolen</option><option value="free">Free text</option></select><br>'
					);
				}
				function docjellemzo() {
					$('.docjellemzo').on('change', function() {
						sajatid = $(this).attr('id');
						var sajatalszam = sajatid.slice($(this).attr('id').indexOf('_') + 1, sajatid.length);
						sajatalszamszamkent = Number(sajatalszam);
						var sajatfoszam = sajatid.slice(3, $(this).attr('id').indexOf('_'));
						sajatfoszamszamkent = Number(sajatfoszam);
						sajatalszamotkovetoszam = sajatalszamszamkent + 1;
						torlendoform = '#form' + sajatfoszamszamkent + '_' + sajatalszamszamkent;
						$('#fb' + sajatfoszam + '_' + sajatalszam).remove()[0];
						if ($(torlendoform)[0] != undefined) {
							fotomb.forEach(function(k, kindex) {
								fotomb[kindex].forEach(function(m, mindex) {
									fotomb[kindex][mindex].forEach(function(h, hindex) {
										if (typeof h === 'object') {
											for (var i = 0; i < h.length; i++) {
												if (
													h[i].kapcs ===
													'e' + sajatfoszamszamkent + '_' + sajatalszamszamkent
												) {
													fotomb[kindex][mindex][hindex].splice(i, 1);
													szovegfeaturetorles(
														'e' + sajatfoszamszamkent + '_' + sajatalszamszamkent
													);
												}
											}
										}
									});
								});
							});
							$(torlendoform).remove()[0];
							alszamlalo = alszamlalo - 1;
						}
						if (this.value === 'issuedto') {
							issuedto();
						}
						if (this.value === 'issuedon') {
							issuedon();
						}
						if (this.value === 'lost/stolen') {
							doclost();
						}
						if (this.value === 'free') {
							docfree();
						}
						$(this).after(
							'<button type="button" id="fb' +
								sajatfoszamszamkent +
								'_' +
								(sajatalszamszamkent - 1) +
								'" onclick="featureplusbutton(this.id)" class="btn mr-2 btn-info ml-2 featplusbutton" data-toggle="tooltip" data-placement="top" title="Add another feature of this type">+</button>'
						);
						$('#form' + sajatfoszam + '_' + sajatalszam).find('input:first').focus();
						$('#form' + sajatfoszam + '_' + sajatalszam).find('textarea:first').focus();
						$('[data-toggle="tooltip"]').tooltip();
						$('.docjellemzo').off('change');
						$(this).find('option:first').attr('disabled', 'true');
						docjellemzo();
					});
				}
				docjellemzo();
				szoveg(tomb);
			});
		}
		if (this.value === 'Free text') {
			alszamlalo = 0;
			$('#' + aktfoszam).append('<div id="t' + aktfoszam + '"></div>');
			$('#t' + aktfoszam).append(
				'<form class="form-inline" onsubmit="return false"><textarea class="freesz e' +
					aktfoszam +
					'_' +
					alszamlalo +
					' col" rows="5" placeholder="free text"></textarea><button type="button" id="b' +
					aktfoszam +
					'" onclick="objektumtorles(this)" class="btn ml-2 mr-2 btn-outline-danger freetext mb-2" data-toggle="tooltip" data-placement="top" title="Remove this object">-</button><button type="submit" class="gomb btn btn-primary mb-2 ml-2" id="e' +
					aktfoszam +
					'_' +
					alszamlalo +
					'">Add</button></form>'
			);
			alszamlalo = alszamlalo + 1;
			$(this).after(
				'<button type="button" id="b' +
					aktfoszam +
					'" onclick="objplusbutton(this.id)" class="btn mr-2 btn-info ml-2 mb-2 objplusbutton" data-toggle="tooltip" data-placement="top" title="Add another object of this type">+</button>'
			);
			$('[data-toggle="tooltip"]').tooltip();
			$('#e' + aktfoszam + '_' + (alszamlalo - 1)).on('click', function(prop) {
				prop.stopPropagation();
				$(this).text('Update');
				aktfoszam = $(this).attr('id').slice(1, $(this).attr('id').indexOf('_'));
				aktualisid = $(this).attr('id');
				aktfoszam = $(this).attr('id').slice(1, $(this).attr('id').indexOf('_'));
				var freeszoveg = $('.freesz.' + aktualisid).val();
				tomb[aktfoszam].szabadszoveg = freeszoveg;
				szoveg(tomb);
			});
		}
		// diszfaterid = $(this).parent().attr('id');
		// diszfateridszamkentpegy = Number(diszfaterid) + 1;
		// if ($('#' + diszfateridszamkentpegy)[0] === undefined) {
		if ($(this).parent().next()[0] === undefined) {
			szamlalo = szamlalo + 1;
			$('#fo').append(
				'<div id="' +
					szamlalo +
					'" class="foentitas mt-4"><h3>Add new object</h3><select class="custom-select col-3 entitas mb-2 e' +
					szamlalo +
					'"><option value="Choose">Choose</option><option value="Person">Person</option><option value="Person (inserted)">Person (inserted)</option><option value="Vehicle">Vehicle</option><option value="Document">Document</option><option value="Phone number">Phone number</option><option value="Bank account">Bank account</option><option value="Company">Company</option><option value="Free text">Free text</option></select></div>'
			);
			$('#' + szamlalo).addClass('p-3 rounded');
		}
		$('#' + aktfoszam).children('h3').attr('hidden', true);
		if ($(this).val() === 'Free text') {
			$(this).next().next().children().children().first().focus();
		} else if ($(this).val() === 'Person (inserted)') {
			$(this).next().next().children().children('textarea').focus();
		} else {
			$(this).next().next().children().children().children().first().focus();
		}
		$('.entitas').off('change');
		fofunkcio();
		return;
	});
}

function objplusbutton(valasztott) {
	let kivalasztott = valasztott.slice(1, valasztott.length);
	let ilyetadjonhozza = $('.e' + kivalasztott).val();
	$('.e' + szamlalo).val(ilyetadjonhozza).change();
}

function featureplusbutton(valasztott) {
	let kivalasztott = valasztott.slice(2, valasztott.indexOf('_'));
	let elozoidja = valasztott.replace('fb', 'szj');
	let ilyetadjonhozza = $('#' + elozoidja).val();
	$('#t' + kivalasztott).children('select').last().val(ilyetadjonhozza).change();
}

$('#refresh').on('click', function() {
	location.reload();
});

function koztesvegere(disz) {
	var atvez = $(disz).prevAll().eq(5).val().toUpperCase();
	var atker = $(disz).prevAll().eq(4).val();
	var atev = $(disz).prevAll().eq(3).val();
	var athonap = $(disz).prevAll().eq(2).val();
	var atnap = $(disz).prevAll().eq(1).val();
	pluszszemelyvegere(null, atvez, atker, atev, athonap, atnap);
}

function megegyszemely(disz) {
	var elottelevoklassz6 = $(disz).prevAll().eq(6).attr('class');
	var elottelevoklassz5 = $(disz).prevAll().eq(5).attr('class');
	var elottelevoklassz4 = $(disz).prevAll().eq(4).attr('class');
	var elottelevoklassz3 = $(disz).prevAll().eq(3).attr('class');
	var elottelevoklassz2 = $(disz).prevAll().eq(2).attr('class');
	var elottelevoklassz1 = $(disz).prevAll().eq(1).attr('class');
	$(disz)
		.parent()
		.after(
			'<div class="form-row"><input class="rugvez ' +
				elottelevoklassz6 +
				'" type="text" placeholder="family name"><input class="rugker ' +
				elottelevoklassz5 +
				'" type="text" placeholder="given name"><input class="rugyear ' +
				elottelevoklassz4 +
				'" type="text" placeholder="year of birth"><input class="rugmonth ' +
				elottelevoklassz3 +
				'" type="text" placeholder="month of birth"><input class="rugday ' +
				elottelevoklassz2 +
				'" type="text" placeholder="day of birth"><input class="rugother ' +
				elottelevoklassz1 +
				'" type="text" placeholder="other pers. data"><button type="button" id="b' +
				aktfoszam +
				'" onclick="koztesvegere(this)" class="ujsorbaszemely btn mr-2 btn-sm btn-info mb-2" data-toggle="tooltip" data-placement="top" title="Add this person as a new main object">@</button><button type="button" id="b' +
				aktfoszam +
				'" onclick="megegyszemely(this)" class="szempluszgomb btn mr-2 btn-sm btn-info mb-2" data-toggle="tooltip" data-placement="top" title="Add a new person to this object">+</button></div>'
		);
	$('[data-toggle="tooltip"]').tooltip();
}

function szemelygen() {
	var atvez = $('.rugvez.' + aktualisid).val().toUpperCase();
	var atker = $('.rugker.' + aktualisid).val();
	var atev = $('.rugyear.' + aktualisid).val();
	var athonap = $('.rugmonth.' + aktualisid).val();
	var atnap = $('.rugday.' + aktualisid).val();
	var teljesszemely = '';
	for (var i = 0; i < $('.rugvez.' + aktualisid).length; i++) {
		if ($($('.rugvez.' + aktualisid)[i]).val() != '') {
			var atvez = $($('.rugvez.' + aktualisid)[i]).val().toUpperCase();
		} else {
			var atvez = '';
		}
		if ($($('.rugker.' + aktualisid)[i]).val() != '') {
			var atker = ' ' + $($('.rugker.' + aktualisid)[i]).val();
		} else {
			var atker = $($('.rugker.' + aktualisid)[i]).val();
		}
		if ($($('.rugother.' + aktualisid)[i]).val() != '') {
			var egyeb = ', ' + $($('.rugother.' + aktualisid)[i]).val();
		} else {
			var egyeb = '';
		}
		if ($($('.rugyear.' + aktualisid)[i]).val() != '') {
			var szuletido =
				' (DOB: ' +
				$($('.rugday.' + aktualisid)[i]).val() +
				'/' +
				$($('.rugmonth.' + aktualisid)[i]).val() +
				'/' +
				$($('.rugyear.' + aktualisid)[i]).val() +
				')';
		} else {
			var szuletido = '';
		}
		if (i + 1 < $('.rugvez.' + aktualisid).length) {
			var opcvesszo = ', ';
		} else {
			var opcvesszo = '';
		}
		var teljesszemely = teljesszemely + atvez + atker + szuletido + egyeb + opcvesszo;
	}
	return teljesszemely;
}

function pluszszemelyvegere(disz, vnev, kernev, szev, szhonap, sznap) {
	var elozo = $(disz).prev()[0];
	elozoertek = $(elozo).val();
	$('#' + szamlalo).remove()[0];
	$('#fo').append(
		'<div id="' +
			szamlalo +
			'" class="foentitas mt-4"><h3>Add new object</h3><select class="custom-select col-3 entitas mb-2 e' +
			szamlalo +
			'"><option value="Choose" disabled>Choose</option><option value="Person" selected="selected">Person</option><option value="Person (inserted)">Person (inserted)</option><option value="Vehicle">Vehicle</option><option value="Document">Document</option><option value="Phone number">Phone number</option><option value="Bank account">Bank account</option><option value="Company">Company</option><option value="Free text">Free text</option></select></div>'
	);
	alszamlalo = 0;
	$('#' + szamlalo).append('<div id="t' + szamlalo + '"></div>');
	$('#t' + szamlalo).append(
		'<form onsubmit="return false"><div class="form-row"><input class="col form-control mand col mb-2 mr-sm-2 veznev e' +
			szamlalo +
			'_' +
			alszamlalo +
			'" type="text" value="' +
			vnev +
			'" placeholder="family name (mandatory)"><input class="col form-control mand col mb-2 mr-sm-2 kernev e' +
			szamlalo +
			'_' +
			alszamlalo +
			'" type="text" value="' +
			kernev +
			'" placeholder="given name (mandatory)"><input class="col form-control col mb-2 mr-sm-2 szulev e' +
			szamlalo +
			'_' +
			alszamlalo +
			'" type="text" value="' +
			szev +
			'" placeholder="year of birth"><input class="col form-control col mb-2 mr-sm-2 szulhonap e' +
			szamlalo +
			'_' +
			alszamlalo +
			'" type="text" value="' +
			szhonap +
			'" placeholder="month of birth"><input class="col form-control col mb-2 mr-sm-2 szulnap e' +
			szamlalo +
			'_' +
			alszamlalo +
			'" type="text" value="' +
			sznap +
			'" placeholder="day of birth"></div><div class="form-row"><input class="col form-control col mb-2 mr-sm-2 szulhely e' +
			szamlalo +
			'_' +
			alszamlalo +
			'" type="text" placeholder="place of birth"><input class="col form-control col mb-2 mr-sm-2 anyjaneve e' +
			szamlalo +
			'_' +
			alszamlalo +
			'" type="text" placeholder="maiden name of mother"><input class="col-5 form-control col mb-2 mr-sm-2 lakcim e' +
			szamlalo +
			'_' +
			alszamlalo +
			'" type="text" placeholder="address"><input class="col form-control col mb-2 mr-sm-2 allampolgarsag e' +
			szamlalo +
			'_' +
			alszamlalo +
			'" type="text" placeholder="citizenship"></div><div class="form-row"><input class="form-control col mb-2 mr-sm-2 pfree e' +
			szamlalo +
			'_' +
			alszamlalo +
			'" type="text" placeholder="free text"><select class="custom-select mb-2 mr-2 col-1 sex e' +
			szamlalo +
			'_' +
			alszamlalo +
			'"><option value="He/she">sex</option><option value="He">male</option><option value="She">female</option></select><button type="button" id="b' +
			aktfoszam +
			'" onclick="objektumtorles(this)" class="btn mr-2 btn-sm btn-outline-danger mb-2" data-toggle="tooltip" data-placement="top" title="Remove this object">-</button><button type="submit" class="plusz gomb btn btn-primary mb-2" id="e' +
			szamlalo +
			'_' +
			alszamlalo +
			'">Add</button></div></form>'
	);
	valasztott = 'Person';
	$('.e' + szamlalo).after(
		'<button type="button" id="b' +
			szamlalo +
			'" onclick="objplusbutton(this.id)" class="btn mr-2 btn-info ml-2 mb-2 objplusbutton" data-toggle="tooltip" data-placement="top" title="Add another object of this type">+</button>'
	);
	$('[data-toggle="tooltip"]').tooltip();
	alszamlalo = alszamlalo + 1;
	//$(".f" + aktfoszam + "_" + (alszamlalo-1)).submit(function(prop){
	$('.plusz').on('click', function(prop) {
		prop.stopPropagation();
		$(this).text('Update');
		if (tomb[$(this).parent().parent().parent().parent().attr('id')] === undefined) {
			tomb[$(this).parent().parent().parent().parent().attr('id')] = {};
		}
		aktfoszam = $(this).attr('id').slice(1, $(this).attr('id').indexOf('_'));
		aktualisid = $(this).attr('id');
		var veznev = $('.veznev.' + aktualisid).val();
		var kernev = $('.kernev.' + aktualisid).val();
		var szulev = $('.szulev.' + aktualisid).val();
		var szulhonap = $('.szulhonap.' + aktualisid).val();
		var szulnap = $('.szulnap.' + aktualisid).val();
		var szulhely = $('.szulhely.' + aktualisid).val();
		var anyjaneve = $('.anyjaneve.' + aktualisid).val();
		var lakcim = $('.lakcim.' + aktualisid).val();
		var allampolgarsag = $('.allampolgarsag.' + aktualisid).val();
		if (szulev != '') {
			var szulido = ', DOB: ' + szulnap + '/' + szulhonap + '/' + szulev;
		} else {
			var szulido = '';
		}
		if (szulhely != '') {
			var szulhelykiir = ', POB: ' + szulhely;
		} else {
			var szulhelykiir = '';
		}
		if (anyjaneve != '') {
			var anyjanevekiir = ", mother's maiden name: " + anyjaneve;
		} else {
			var anyjanevekiir = '';
		}
		if (lakcim != '') {
			var lakcimkiir = ', address: ' + lakcim;
		} else {
			var lakcimkiir = '';
		}
		if (allampolgarsag != '') {
			var allampolgarsagkiir = ', citizenship: ' + allampolgarsag;
		} else {
			var allampolgarsagkiir = '';
		}
		if ($('.pfree.' + aktualisid).val() != '') {
			var szemszabad = '. ' + $('.pfree.' + aktualisid).val();
		} else {
			var szemszabad = '';
		}
		var szemely =
			"<b><p class='font-weight-bold'>Concerning " +
			veznev.toUpperCase() +
			', ' +
			kernev +
			szulido +
			szulhelykiir +
			anyjanevekiir +
			lakcimkiir +
			allampolgarsagkiir +
			szemszabad +
			':</p></b>';
		tomb[aktfoszam].nev = szemely;

		addyesorno('buntetlen', 'No convictions ');
		addyesorno('folyamatban', 'Not a suspect ');
		addyesorno('ugyek', 'No police files ');
		addyesorno('ugyekrel', 'No relevant police files ');
		addyesorno('hatarnincs', 'No border crossings ');
		addyesorno('hatarvan', 'Border crossing(s) enclosed ');
		addyesorno('nincstars', 'Border cr.: no co-travellers ');
		addyesorno('nincsauto', 'No vehicles ');
		addyesorno('nincsceg', 'No companies ');
		addyesorno('photos', 'Photo(s) enclosed ');
		addyesorno('fingenc', 'Fingerprints enclosed ');
		addyesorno('notinprison', 'Not in prison ');
		addyesorno('noimmigr', 'No immigr. rec. ');

		feedyesorno('buntetlen', 'This person has no convictions.');
		feedyesorno('folyamatban', 'This individual is not a suspect in any ongoing criminal investigation.');
		feedyesorno('ugyek', 'He/she has no police files.');
		feedyesorno('ugyekrel', 'He/she has no relevant police files.');
		feedyesorno(
			'hatarnincs',
			'This individual has no registered border crossings. Please be advised that EU-citizens / vehicles driven by EU-citizens are not recorded in the border crossing’s database in my country.'
		);
		feedyesorno('hatarvan', 'Please find his/her border crossing records enclosed.');
		feedyesorno(
			'nincstars',
			'No co-travellers were registered related to his/her border crossing(s). Please take note that this does not fully exclude the possibility of the existence of potential co-travellers.'
		);
		feedyesorno('nincsauto', 'This person is not the registered owner of any vehicles in my country.');
		feedyesorno('nincsceg', 'This individual is not the registered owner of any companies in my country.');
		feedyesorno('photos', 'Please find his/her photo(s) attached.');
		feedyesorno('fingenc', 'Please find his/her fingerprints enclosed.');
		feedyesorno('notinprison', 'This individual is not in prison currenty in my country.');
		feedyesorno('noimmigr', 'Our searches revealed no immigration records of this person.');

		if ($('#t' + aktfoszam).find('.szemelyjellemzo')[0] === undefined) {
			$('#t' + aktfoszam).append(
				'<br><select id="szj' +
					aktfoszam +
					'_' +
					alszamlalo +
					'"class="szemelyjellemzo custom-select col-3 mt-2 mb-2 mb-2"><option value="valasztas">Add new feature</option><option value="perspart">Personal particulars</option><option value="conviction">Conviction</option><option value="ongoing">Ongoing procedure</option><option value="questioning">Questioned by the police</option><option value="control">Controlled by the police</option><option value="border">Border crossing</option><option value="case">Criminal case</option><option value="phone">Phone number</option><option value="documents">Document</option><option value="address">Address</option><option value="company">Company</option><option value="vehicle">Vehicle</option><option value="alias">Alias</option><option value="wanted">Wanted</option><option value="free">Free text</option></select><br>'
			);
		}
		function szemelyjellemzo() {
			$('.szemelyjellemzo').on('change', function() {
				sajatid = $(this).attr('id');
				var sajatalszam = sajatid.slice($(this).attr('id').indexOf('_') + 1, sajatid.length);
				sajatalszamszamkent = Number(sajatalszam);
				var sajatfoszam = sajatid.slice(3, $(this).attr('id').indexOf('_'));
				sajatfoszamszamkent = Number(sajatfoszam);
				sajatalszamotkovetoszam = sajatalszamszamkent + 1;
				torlendoform = '#form' + sajatfoszamszamkent + '_' + sajatalszamszamkent;
				$('#fb' + sajatfoszam + '_' + sajatalszam).remove()[0];
				if ($(torlendoform)[0] != undefined) {
					fotomb.forEach(function(k, kindex) {
						fotomb[kindex].forEach(function(m, mindex) {
							fotomb[kindex][mindex].forEach(function(h, hindex) {
								if (typeof h === 'object') {
									for (var i = 0; i < h.length; i++) {
										if (h[i].kapcs === 'e' + sajatfoszamszamkent + '_' + sajatalszamszamkent) {
											fotomb[kindex][mindex][hindex].splice(i, 1);
											szovegfeaturetorles('e' + sajatfoszamszamkent + '_' + sajatalszamszamkent);
										}
									}
								}
							});
						});
					});
					$(torlendoform).remove()[0];
					alszamlalo = alszamlalo - 1;
				}
				if (this.value === 'perspart') {
					perspart();
				}
				if (this.value === 'conviction') {
					conviction();
				}
				if (this.value === 'ongoing') {
					ongoing();
				}
				if (this.value === 'questioning') {
					questioning();
				}
				if (this.value === 'control') {
					control();
				}
				if (this.value === 'border') {
					borderc();
				}
				if (this.value === 'phone') {
					phone();
				}
				if (this.value === 'documents') {
					documents();
				}
				if (this.value === 'address') {
					address();
				}
				if (this.value === 'company') {
					company();
				}
				if (this.value === 'case') {
					incase();
				}
				if (this.value === 'vehicle') {
					vehicle();
				}
				if (this.value === 'alias') {
					alias();
				}
				if (this.value === 'wanted') {
					wanted();
				}
				if (this.value === 'free') {
					free();
				}
				$(this).after(
					'<button type="button" id="fb' +
						sajatfoszamszamkent +
						'_' +
						(sajatalszamszamkent - 1) +
						'" onclick="featureplusbutton(this.id)" class="btn mr-2 btn-info ml-2 featplusbutton" data-toggle="tooltip" data-placement="top" title="Add another feature of this type">+</button>'
				);
				$('.szemelyjellemzo').off('change');
				$('[data-toggle="tooltip"]').tooltip();
				$(this).find('option:first').attr('disabled', 'true');
				szemelyjellemzo();
			});
		}
		//$(".plusz").off("click");
		szemelyjellemzo();
		szoveg(tomb);
	});
	$('#' + szamlalo).children('h3').attr('hidden', true);
	$('#' + szamlalo).children('select').addClass('kivalfont');
	$('#' + szamlalo).addClass('p-3 rounded');
	szamlalo = szamlalo + 1;
	$('#fo').append(
		'<div id="' +
			szamlalo +
			'" class="foentitas mt-4"><h3>Add new object</h3><select class="custom-select col-3 entitas mb-2 e' +
			szamlalo +
			'"><option value="Choose">Choose</option><option value="Person">Person</option><option value="Person (inserted)">Person (inserted)</option><option value="Vehicle">Vehicle</option><option value="Document">Document</option><option value="Phone number">Phone number</option><option value="Bank account">Bank account</option><option value="Company">Company</option><option value="Free text">Free text</option></select></div>'
	);
	$('#' + szamlalo).addClass('p-3 rounded');
	fofunkcio();
	return;
}

function szoveg(placeh) {
	for (var n = 0; n < szamlalo; n++) {
		if (placeh[n] != undefined && Number(aktfoszam) === n) {
			if (tombositve[n] != undefined && tombositve[n][0] != undefined && tombositve[n][0][2] != undefined) {
				var kiment = tombositve[n][0][2];
			}
			tombositve[n] = Object.entries(placeh[n]);
			if (aktualisid.substr(aktualisid.length - 2) === '_0') {
				tombositve[n][0][2] = aktualisid;
			}
			if (tombositve[n][0][2] === undefined) {
				tombositve[n][0][2] = kiment;
			}
		}
	}
	//console.log("Tömbösítve: ", tombositve);
	fotomb[aktfoszam] = [];
	tombositve[aktfoszam].forEach(function(i, index) {
		fotomb[aktfoszam][index] = i;
	});
	uzenetkeszito();
}

function szovegtorles(placeh) {
	tombositve[aktfoszam] = [];
	$('#sz_' + aktfoszam).remove();
}

function szovegfeaturetorles(placeh) {
	var szulo = $('#sz_' + placeh).parent();
	$('#sz_' + placeh).remove();
	var szulomaradekgyereke = $(szulo).children()[1];
	if (szulomaradekgyereke === undefined) {
		$(szulo).remove();
	}
}

function uzenetkeszito() {
	fotomb.forEach(function(i, index) {
		for (var n = 0; n < fotomb[index].length; n++) {
			if (n === 0 && aktualisid === i[0][2]) {
				//console.log("alapos lefut");
				if ($('#sz_' + i[0][2])[0] === undefined) {
					//console.log("alapos első fele lefut");
					$('#uzenet').append("<div id='sz_" + aktfoszam + "'></div>");
					$('#sz_' + index).append(
						"<div id='sz_" + i[0][2] + "' contenteditable='true'>" + i[0][1] + '</div>'
					);
					$('#sz_' + i[0][2]).after("<div class='objfelsoszabadszerk' contenteditable='true'>&nbsp;</div>");
					$('#sz_' + index).append("<div class='objalsoszabadszerk' contenteditable='true'>&nbsp;</div>");
					mitszerkeszt('sz_' + i[0][2]);
				} else {
					//console.log("alapos második fele lefut");
					$($('#sz_' + i[0][2])[0]).html(i[0][1]);
				}
			}
			if (typeof i[n][1][0] === 'object' && i[n][1] !== null) {
				//console.log("featurös lefut");
				altombositve = i[n][1];
				altombositve.forEach(function(x, xindex) {
					if (xindex === 0 && x.kapcs === aktualisid) {
						if (x.bevez != 'nincs' && x.bevez != '' && $('#sz_' + x.kapcs)[0] === undefined) {
							//console.log("első rész");
							$('#sz_' + index)
								.children()
								.last()
								.before('<div id="techuresdiv_' + aktfoszam + '_' + i[n][0] + '"></div>');
							$('#techuresdiv_' + aktfoszam + '_' + i[n][0]).append(
								'<div id="uzenetfeature_' +
									aktfoszam +
									'_' +
									i[n][0] +
									'" contenteditable="true">' +
									x.bevez +
									'</div>'
							);
							$('#techuresdiv_' + aktfoszam + '_' + i[n][0]).append(
								"<div id='sz_" + x.kapcs + "' contenteditable='true'>- " + x.tart + '</div>'
							);
							mitszerkeszt('sz_' + x.kapcs);
						} else if (x.bevez === '' && $('#sz_' + x.kapcs)[0] === undefined) {
							//console.log("második rész");
							$('#sz_' + index)
								.children()
								.last()
								.before('<div id="sz_' + x.kapcs + '" contenteditable="true">' + x.tart + '</div>');
							mitszerkeszt('sz_' + x.kapcs);
						} else {
							//console.log("harmadik rész");
							if (x.bevez === '') {
								$('#sz_' + x.kapcs).html(x.tart);
							} else {
								$('#sz_' + x.kapcs).html('- ' + x.tart);
							}
						}
					} else if (x.kapcs === aktualisid) {
						if (x.bevez != 'nincs' && x.bevez != '' && $('#sz_' + x.kapcs)[0] === undefined) {
							$('#techuresdiv_' + aktfoszam + '_' + i[n][0]).append(
								"<div id='sz_" + x.kapcs + "' contenteditable='true'>- " + x.tart + '</div>'
							);
							mitszerkeszt('sz_' + x.kapcs);
						} else if (x.bevez === '' && $('#sz_' + x.kapcs)[0] === undefined) {
							$('#sz_' + index)
								.children()
								.last()
								.before('<div id="sz_' + x.kapcs + '" contenteditable="true">' + x.tart + '</div>');
							mitszerkeszt('sz_' + x.kapcs);
						} else {
							if (x.bevez === '') {
								$('#sz_' + x.kapcs).html(x.tart);
							} else {
								$('#sz_' + x.kapcs).html('- ' + x.tart);
							}
						}
					}
				});
			}
			if (n != 0 && i[n].length > 1 && i[n][1][1] === aktualisid) {
				//console.log("ikszelős lefut");
				if (i[n][1][0] != '') {
					$('#sz_e' + index + '_0')
						.next()
						.after(
							'<div id="uzenetfeaturex_' +
								aktfoszam +
								'_' +
								i[n][0] +
								'" contenteditable="true">' +
								i[n][1][0] +
								'</div>'
						);
					mitszerkeszt('uzenetfeaturex_' + aktfoszam + '_' + i[n][0]);
				} else {
					$('#uzenetfeaturex_' + aktfoszam + '_' + i[n][0]).remove();
				}
			}
		}
	});
	uzenetformara();
}

function uzenetformara() {
	//document.querySelector("#masolandouzenet").outerHTML = document.querySelector("#masolandouzenet").outerHTML;
	veletlen();
	firstTextGen += 1;
	$('#masolandouzenet').attr('hidden', false);
	var hosszu =
		'<br>----------------------------------------------------------------------------------------<br>Note for traffic surveillance system regarding HU-EN translations: <br>Esemény azonosító – Event identification number<br>Esemény létrejötte – Date and time<br>Ellenőrzési helyszín neve – Location<br>Út azonosító – Road identification number<br>Hátsó rendszám – Rear license plate number<br>Hátsó honosság – Country of origin (rear) <br>Első rendszám – Front licence plate number<br>Első honosság – Country of origin (front) <br>Díjkategória – Toll category <br>Sebesség – Speed<br>Javított első rendszám – Corrected front license plate<br>Szélességi fok - Latitude<br>Hosszúsági fok - Longitude <br>-------------------------------------------------------------------------------------<br>';
	elsoherrnotes = $('#uzenet')
		.html()
		.indexOf(
			'<br>----------------------------------------------------------------------------------------<br>Note for HERR (Border Crossings Registration System) regarding HU-EN translations:<br><br>férfi: MALE<br>nő: FEMALE<br>Be: Entry<br>Ki: Exit<br>Közúti határátkelőhely: road BCP<br>Vasúti átkelőhely: Railway BCP<br>Autópálya határátkelőhely: highway BCP<br>Légi határátkelőhely: airport BCP<br><br>Please be informed that EU-citizens / vehicles driven by EU-citizens are not recorded in the border crossing’s database in my country.<br>-------------------------------------------------------------------------------------<br>'
		);
	utolsoherrnotes = $('#uzenet')
		.html()
		.lastIndexOf(
			'<br>----------------------------------------------------------------------------------------<br>Note for HERR (Border Crossings Registration System) regarding HU-EN translations:<br><br>férfi: MALE<br>nő: FEMALE<br>Be: Entry<br>Ki: Exit<br>Közúti határátkelőhely: road BCP<br>Vasúti átkelőhely: Railway BCP<br>Autópálya határátkelőhely: highway BCP<br>Légi határátkelőhely: airport BCP<br><br>Please be informed that EU-citizens / vehicles driven by EU-citizens are not recorded in the border crossing’s database in my country.<br>-------------------------------------------------------------------------------------<br>'
		);
	while (elsoherrnotes != utolsoherrnotes) {
		var elsofel = $('#uzenet').html().slice(0, utolsoherrnotes);
		var masodikfel = $('#uzenet').html().slice(utolsoherrnotes + 617);
		$('#uzenet').html(elsofel + masodikfel);
		elsoherrnotes = $('#uzenet')
			.html()
			.indexOf(
				'<br>----------------------------------------------------------------------------------------<br>Note for HERR (Border Crossings Registration System) regarding HU-EN translations:<br><br>férfi: MALE<br>nő: FEMALE<br>Be: Entry<br>Ki: Exit<br>Közúti határátkelőhely: road BCP<br>Vasúti átkelőhely: Railway BCP<br>Autópálya határátkelőhely: highway BCP<br>Légi határátkelőhely: airport BCP<br><br>Please be informed that EU-citizens / vehicles driven by EU-citizens are not recorded in the border crossing’s database in my country.<br>-------------------------------------------------------------------------------------<br>'
			);
		utolsoherrnotes = $('#uzenet')
			.html()
			.lastIndexOf(
				'<br>----------------------------------------------------------------------------------------<br>Note for HERR (Border Crossings Registration System) regarding HU-EN translations:<br><br>férfi: MALE<br>nő: FEMALE<br>Be: Entry<br>Ki: Exit<br>Közúti határátkelőhely: road BCP<br>Vasúti átkelőhely: Railway BCP<br>Autópálya határátkelőhely: highway BCP<br>Légi határátkelőhely: airport BCP<br><br>Please be informed that EU-citizens / vehicles driven by EU-citizens are not recorded in the border crossing’s database in my country.<br>-------------------------------------------------------------------------------------<br>'
			);
	}
	elsonusznotes = $('#uzenet')
		.html()
		.indexOf(
			'<br>----------------------------------------------------------------------------------------<br>Note for traffic surveillance system regarding HU-EN translations: <br>Esemény azonosító – Event identification number<br>Esemény létrejötte – Date and time<br>Ellenőrzési helyszín neve – Location<br>Út azonosító – Road identification number<br>Hátsó rendszám – Rear license plate number<br>Hátsó honosság – Country of origin (rear) <br>Első rendszám – Front licence plate number<br>Első honosság – Country of origin (front) <br>Díjkategória – Toll category <br>Sebesség – Speed<br>Javított első rendszám – Corrected front license plate<br>Szélességi fok - Latitude<br>Hosszúsági fok - Longitude <br>-------------------------------------------------------------------------------------<br>'
		);
	utolsonusznotes = $('#uzenet')
		.html()
		.lastIndexOf(
			'<br>----------------------------------------------------------------------------------------<br>Note for traffic surveillance system regarding HU-EN translations: <br>Esemény azonosító – Event identification number<br>Esemény létrejötte – Date and time<br>Ellenőrzési helyszín neve – Location<br>Út azonosító – Road identification number<br>Hátsó rendszám – Rear license plate number<br>Hátsó honosság – Country of origin (rear) <br>Első rendszám – Front licence plate number<br>Első honosság – Country of origin (front) <br>Díjkategória – Toll category <br>Sebesség – Speed<br>Javított első rendszám – Corrected front license plate<br>Szélességi fok - Latitude<br>Hosszúsági fok - Longitude <br>-------------------------------------------------------------------------------------<br>'
		);
	while (elsonusznotes != utolsonusznotes) {
		var elsofel = $('#uzenet').html().slice(0, utolsonusznotes);
		var masodikfel = $('#uzenet').html().slice(utolsonusznotes + 785);
		$('#uzenet').html(elsofel + masodikfel);
		elsonusznotes = $('#uzenet')
			.html()
			.indexOf(
				'<br>----------------------------------------------------------------------------------------<br>Note for traffic surveillance system regarding HU-EN translations: <br>Esemény azonosító – Event identification number<br>Esemény létrejötte – Date and time<br>Ellenőrzési helyszín neve – Location<br>Út azonosító – Road identification number<br>Hátsó rendszám – Rear license plate number<br>Hátsó honosság – Country of origin (rear) <br>Első rendszám – Front licence plate number<br>Első honosság – Country of origin (front) <br>Díjkategória – Toll category <br>Sebesség – Speed<br>Javított első rendszám – Corrected front license plate<br>Szélességi fok - Latitude<br>Hosszúsági fok - Longitude <br>-------------------------------------------------------------------------------------<br>'
			);
		utolsonusznotes = $('#uzenet')
			.html()
			.lastIndexOf(
				'<br>----------------------------------------------------------------------------------------<br>Note for traffic surveillance system regarding HU-EN translations: <br>Esemény azonosító – Event identification number<br>Esemény létrejötte – Date and time<br>Ellenőrzési helyszín neve – Location<br>Út azonosító – Road identification number<br>Hátsó rendszám – Rear license plate number<br>Hátsó honosság – Country of origin (rear) <br>Első rendszám – Front licence plate number<br>Első honosság – Country of origin (front) <br>Díjkategória – Toll category <br>Sebesség – Speed<br>Javított első rendszám – Corrected front license plate<br>Szélességi fok - Latitude<br>Hosszúsági fok - Longitude <br>-------------------------------------------------------------------------------------<br>'
			);
	}
	$('#teljesuzenet').addClass('keszuzenet border border-success rounded');
	if ($('#gombokhelye').find('#edit')[0] === undefined) {
		$('#gombokhelye').append(
			'<span class="pb-1 pr-1"><button type="submit" id="edit" class="btn btn-outline-warning" data-toggle="tooltip" data-placement="top" title="The different components of the message are already editable. This button aims potential final editing (mixing the components)">Final formatting</button></span>'
		);
		$('[data-toggle="tooltip"]').tooltip();
		$('#edit').on('click', function() {
			$('#masolandouzenet').attr('contenteditable', 'true');
		});
	}
	if ($('#gombokhelye').find('#clipboard')[0] === undefined) {
		$('#gombokhelye').append(
			'<span class="pb-1 pr-1"><button type="submit" id="clipboard" class="btn btn-outline-success" data-toggle="tooltip" data-placement="top" title="Copy the whole message to the clipboard (it is not needed to select anything).">Copy</button></span>'
		);
		$('[data-toggle="tooltip"]').tooltip();
		$('#clipboard').on('click', function() {
			function copyToClip() {
				function listener(e) {
					let vagolapNyers = document.getElementById('masolandouzenet').innerHTML;
					let vagolapFeldolg = vagolapNyers.replace(/ contenteditable="true"/g, '');
					e.clipboardData.setData('text/html', vagolapFeldolg);
					e.preventDefault();
				}
				document.addEventListener('copy', listener);
				document.execCommand('copy');
				document.removeEventListener('copy', listener);
			}
			copyToClip();
		});
	}
	if (firstTextGen < 2) {
		document.querySelector('#masolandouzenet').addEventListener('paste', function simaszoveg(event) {
			event.preventDefault();
			document.execCommand('inserttext', false, event.clipboardData.getData('text/plain'));
		});
	}
}

function veletlen() {
	var veletlenszam = Math.floor(Math.random() * 10 + 1);
	$('#cim').text('Your custom-tailored SIENA message:');
	if (mentettkezdet === '' || mentettkezdet === $('#uzenetkezdet').html()) {
		if (veletlenszam < 5) {
			$('#uzenetkezdet').html('Dear Colleagues,<br><br>Please be informed,');
		} else if (veletlenszam < 7) {
			$('#uzenetkezdet').html('Dear Colleagues,<br><br>Please be advised,');
		} else {
			$('#uzenetkezdet').html('Dear Colleagues,<br><br>We hereby inform you,');
		}
		mentettkezdet = $('#uzenetkezdet').html();
	}
	if (mentettveg === '' || mentettveg === $('#uzenetveg').html()) {
		if (veletlenszam < 5) {
			$('#uzenetveg').html('Kind regards');
		} else if (veletlenszam < 7) {
			$('#uzenetveg').html('Regards');
		} else {
			$('#uzenetveg').html('Best regards');
		}
		mentettveg = $('#uzenetveg').html();
	}
}

function addyesorno(megnev, megnevkiirva) {
	if ($('#' + aktfoszam).find('.' + megnev)[0] === undefined) {
		$('#t' + aktfoszam).append(
			'<div class="form-check form-check-inline"><input type="checkbox" class="form-check-input ' +
				megnev +
				'" id="e' +
				aktfoszam +
				'_' +
				alszamlalo +
				'" class="' +
				megnev +
				'" name="' +
				megnev +
				'"><label class="form-check-label" for="e' +
				aktfoszam +
				'_' +
				alszamlalo +
				'">' +
				megnevkiirva +
				'</label></div>'
		);
		alszamlalo = alszamlalo + 1;
	}
}

function feedyesorno(megnev, leiras) {
	$('.' + megnev).off('change');
	$('.' + megnev).on('change', function() {
		aktfoszam = $(this).attr('id').slice(1, $(this).attr('id').indexOf('_'));
		aktualisid = $(this).attr('id');
		if (this.checked === true) {
			tomb[aktfoszam][megnev] = [];
			if ($('.e' + aktfoszam).val() === 'Person') {
				nembeloves();
				var nemesleiras = leiras.replace('He/she', neme);
				var nemesleiras = nemesleiras.replace('his/her', birtokosneme);
				tomb[aktfoszam][megnev][0] = nemesleiras;
			} else {
				tomb[aktfoszam][megnev][0] = leiras;
			}
			tomb[aktfoszam][megnev][1] = aktualisid;
			szoveg(tomb);
		} else {
			tomb[aktfoszam][megnev][0] = '';
			tomb[aktfoszam][megnev][1] = aktualisid;
			szoveg(tomb);
		}
		$('.' + megnev).off('change');
		feedyesorno(megnev, leiras);
	});
}

function alsoyesorno(megnev, megnevkiirva, szoveg) {
	$('#lentio').append(
		'<div class="form-check form-check-inline"><input type="checkbox" class="form-check-input" id="' +
			megnev +
			'"><label class="form-check-label" for="' +
			megnev +
			'">' +
			megnevkiirva +
			'</label></div>'
	);
	$('#' + megnev).on('change', function() {
		if (this.checked === true) {
			$('#lentikiir').append('<div id="' + megnev + '">' + szoveg + '<br></div>');
			$('#lentikiir').attr('hidden', false);
			lentikiirszaml = lentikiirszaml + 1;
			uzenetformara();
		} else {
			$('#' + megnev).remove();
			lentikiirszaml = lentikiirszaml - 1;
			if (lentikiirszaml === 0) {
				$('#lentikiir').attr('hidden', true);
			}
		}
		// $("#" + megnev).off("click");
		// alsoyesorno(megnev, megnevkiirva, szoveg);
	});
}

//alsoyesorno("herrtighten", "HERR tighten ", "<br>Please find the requested border crossings enclosed.  Having regard to the high number of border crossings within the requested period and the lack of possibility to check co-travellers in an automatic way (only manual searches are possible, one-by-one connected to each crossing), please specify the crossings (if any) related to which you request the personal data of the co-travellers.<br>");
//alsoyesorno("nuszprogress", "NÚSZ in progress ", "Please be advised, that we forwarded your enquiry to the competent unit in order to determine the movements of the vehicle with the given number plate in my country. The result will be communicated to you asap.<br>");
alsoyesorno(
	'lepatt',
	'No links',
	"Please note that in order to deal with your request as efficiently as possible and in line with Europol's policy on the use of SIENA, we would require information indicating how the investigation you are conducting (if there any) is or may be related to my country. In case there would be no apparent links, please let us know whether you still believe there are reasons recommending our involvement so that we can assess the matter further.<br><br>Thank you for your cooperation.<br>"
);
alsoyesorno(
	'adatkell',
	'Details needed ',
	'Please note that in order to deal with your request as efficiently as possible, we kindly ask for information on the (short) summary of the facts of the case that you are investigating, including: the committed crime (date, modus operandi and legal classification), possible perpetrators (if known) and clarification how the requested data can facilitate your investigation (how is it connected to the case). Thank you for your understanding. <br>'
);
alsoyesorno(
	'voltmar',
	'Already answered ',
	'We kindly draw your attention to the SIENA-string: . In this message we have already provided you with an answer. We have no new information available.<br>'
);
alsoyesorno(
	'fiu',
	'FIU ',
	'Please be informed, that the Financial Investigation Unit (FIU) is responsible in my country for freezing bank accounts (in the lack of an ongoing investigation / EIO). FIU receives requests only directly, via FIU channel (from your national FIU). Please get in touch with your national FIU.<br>'
);
alsoyesorno(
	'eio',
	'EIO ',
	'Please be advised, that in order to carry out the measures in your enquiry - according to the applicable legislation - an EIO is kindly requested.<br>'
);
alsoyesorno(
	'interpolst',
	'Use Interpol ',
	'We kindly ask you to use INTERPOL-channel regarding the insertion of the stolen objects into the stolen objects’ database.<br>'
);
alsoyesorno(
	'reqforw',
	'Request forwarded ',
	"Please be informed that we've forwarded your request to the competent police unit in order to provide you with a detailed answer. Your enquiry will be replied as soon as possible.<br>"
);
alsoyesorno(
	'reqeval',
	'Request forw. - evaluate ',
	"Please be advised that we've forwarded your request to the competent police unit in order to evaluate it and facilitate further information exchange.<br>"
);
alsoyesorno(
	'reqevent',
	'Request forw. - condit. ',
	"Please be informed that we've forwarded your request to the competent police unit in order to evaluate it and to provide you with a more detailed answer (in case they have relevant intel).<br>"
);
alsoyesorno('szovegesnia', 'NIA ', 'Our searches revealed no hits regarding the concerned entities. <br>');
alsoyesorno('szovegesniamasra', 'NIA (others)', 'Our searches revealed no hits regarding the other entities. <br>');
alsoyesorno(
	'prum',
	'PRÜM ',
	'Regarding the check of the fingerprints, we kindly ask you to use the appropriate PRÜM-channel.<br>'
);
alsoyesorno(
	'prumforw',
	'PRÜM forwarded',
	"Please be informed that we've forwarded your request in order to check the fingerprints. Your enquiry will be replied as soon as possible.<br>"
);
//alsoyesorno("subscriber", "Subscriber in progress ", "<br>Please be advised, that we forwarded your enquiry to the competent unit in order to determine the subscriber of the phone number from the provider. The result will be communicated to you asap.<br>");

function objektumtorles(disz) {
	if ($(disz).hasClass('inserted') === true) {
		aktfoszam = Number($(disz).parent().parent().parent().attr('id'));
	} else if ($(disz).hasClass('freetext') === true) {
		aktfoszam = Number($(disz).parent().parent().parent().attr('id'));
		tomb[aktfoszam] = {};
		szovegtorles(tomb);
	} else {
		aktfoszam = Number($(disz).parent().parent().parent().parent().attr('id'));
		tomb[aktfoszam] = {};
		szovegtorles(tomb);
	}
	$(disz).tooltip('hide');
	$('#' + aktfoszam).remove()[0];
}

function featuretorles(disz) {
	sajatid = $(disz).next().attr('id');
	var sajatalszam = sajatid.slice(sajatid.indexOf('_') + 1, sajatid.length);
	sajatalszamszamkent = Number(sajatalszam);
	var sajatfoszam = sajatid.slice(1, sajatid.indexOf('_'));
	sajatfoszamszamkent = Number(sajatfoszam);
	sajatalszamotkovetoszam = sajatalszamszamkent + 1;
	torlendoform = '#form' + sajatfoszamszamkent + '_' + sajatalszamszamkent;
	torlendoszj = '#szj' + sajatfoszamszamkent + '_' + sajatalszamszamkent;
	$(disz).tooltip('hide');
	if ($(torlendoform)[0] != undefined) {
		fotomb.forEach(function(k, kindex) {
			fotomb[kindex].forEach(function(m, mindex) {
				fotomb[kindex][mindex].forEach(function(h, hindex) {
					if (typeof h === 'object') {
						for (var i = 0; i < h.length; i++) {
							if (h[i].kapcs === 'e' + sajatfoszamszamkent + '_' + sajatalszamszamkent) {
								fotomb[kindex][mindex][hindex].splice(i, 1);
								szovegfeaturetorles(sajatid);
							}
						}
					}
				});
			});
		});
		$(torlendoform).remove()[0];
	}
	$(torlendoszj).remove()[0];
	$('#fb' + sajatfoszam + '_' + sajatalszam).remove()[0];
}

function perspart() {
	$('#' + sajatid).after(
		'<form class="" onsubmit="return false" id="form' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'"><div class="form-row"><input class="form-control mand col-3 mb-2 mr-sm-2 veznevt e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" value="' +
			$('.veznev.e' + sajatfoszamszamkent + '_0').val() +
			'" placeholder="family name (mandatory)"><input class="form-control mand col-3 mb-2 mr-sm-2 kernevt e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" value="' +
			$('.kernev.e' + sajatfoszamszamkent + '_0').val() +
			'" placeholder="given name (mandatory)"><input class=" form-control col mb-2 mr-sm-2 szulevt e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" placeholder="year of birth"><input class="form-control col mb-2 mr-sm-2 szulhonapt e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" placeholder="month of birth"><input class="form-control col mb-2 mr-sm-2 szulnapt e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" placeholder="day of birth"><input class="form-control col mb-2 mr-sm-2 szulhelyt e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" placeholder="place of birth"></div><div class="form-row"><input class="col form-control col mb-2 mr-sm-2 anyjanevet e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" placeholder="maiden name of mother"><input class="col form-control col mb-2 mr-sm-2 apjanevet e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" placeholder="name of father"><input class="col-5 form-control col mb-2 mr-sm-2 lakcimt e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" placeholder="address"><input class="col form-control col mb-2 mr-sm-2 allampolgarsagt e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" placeholder="citizenship"></div><div class="form-row"><input class="form-control col mb-2 mr-sm-2 pfreet e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" placeholder="free text"><select class="custom-select mb-2 mr-2 col-1 sext e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'"><option value="He/she">sex</option><option value="male">male</option><option value="female">female</option></select><button type="button" id="b' +
			aktfoszam +
			'" onclick="featuretorles(this)" class="btn mr-2 btn-sm btn-outline-danger mb-2" data-toggle="tooltip" data-placement="top" title="Remove this feature">-</button><button type="submit" class="gomb btn btn-primary mb-2" id="e' +
			+sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'">Add</button></div></form>'
	);
	if ($('.sex.e' + sajatfoszamszamkent + '_0').val() === 'He/she') {
		$('.sext.e' + sajatfoszamszamkent + '_' + sajatalszamszamkent).val('He/she');
	} else if ($('.sex.e' + sajatfoszamszamkent + '_0').val() === 'He') {
		$('.sext.e' + sajatfoszamszamkent + '_' + sajatalszamszamkent).val('male');
	} else {
		$('.sext.e' + sajatfoszamszamkent + '_' + sajatalszamszamkent).val('female');
	}
	$('#e' + sajatfoszamszamkent + '_' + sajatalszamszamkent).on('click', function(prop) {
		prop.stopPropagation();
		$(this).text('Update');
		aktualisid = $(this).attr('id');
		aktfoszam = $(this).attr('id').slice(1, $(this).attr('id').indexOf('_'));
		nembeloves();
		var veznevt = $('.veznevt.' + aktualisid).val();
		var kernevt = $('.kernevt.' + aktualisid).val();
		var szulevt = $('.szulevt.' + aktualisid).val();
		var szulhonapt = $('.szulhonapt.' + aktualisid).val();
		var szulnapt = $('.szulnapt.' + aktualisid).val();
		var szulhelyt = $('.szulhelyt.' + aktualisid).val();
		var anyjanevet = $('.anyjanevet.' + aktualisid).val();
		var apjanevet = $('.apjanevet.' + aktualisid).val();
		var lakcimt = $('.lakcimt.' + aktualisid).val();
		var allampolgarsagt = $('.allampolgarsagt.' + aktualisid).val();
		var sext = $('.sext.' + aktualisid).val();
		if (szulevt != '') {
			var szulidot = ', DOB: ' + szulnapt + '/' + szulhonapt + '/' + szulevt;
		} else {
			var szulidot = '';
		}
		if (szulhelyt != '') {
			var szulhelykiirt = ', POB: ' + szulhelyt;
		} else {
			var szulhelykiirt = '';
		}
		if (anyjanevet != '') {
			var anyjanevekiirt = ", mother's maiden name: " + anyjanevet;
		} else {
			var anyjanevekiirt = '';
		}
		if (apjanevet != '') {
			var apjanevekiirt = ", father's maiden name: " + apjanevet;
		} else {
			var apjanevekiirt = '';
		}
		if (lakcimt != '') {
			var lakcimkiirt = ", address: '" + lakcimt + "'";
		} else {
			var lakcimkiirt = '';
		}
		if (allampolgarsagt != '') {
			var allampolgarsagkiirt = ', citizenship: ' + allampolgarsagt;
		} else {
			var allampolgarsagkiirt = '';
		}
		if (sext != 'He/she') {
			var sexkiir = ', this person is ' + sext;
		} else {
			var sexkiir = '';
		}
		if ($('.pfreet.' + aktualisid).val() != '') {
			var szemszabadt = $('.pfreet.' + aktualisid).val();
		} else {
			var szemszabadt = '';
		}
		var szemelyt =
			'The personal particulars of this person - full name: ' +
			veznevt.toUpperCase() +
			', ' +
			kernevt +
			szulidot +
			szulhelykiirt +
			anyjanevekiirt +
			apjanevekiirt +
			lakcimkiirt +
			allampolgarsagkiirt +
			sexkiir +
			'. ' +
			szemszabadt;
		if (tomb[aktfoszam].perspart === undefined) {
			tomb[aktfoszam].perspart = [];
		}
		tarolo = 0;
		tomb[aktfoszam].perspart.forEach(function(i, index) {
			if (i.kapcs === aktualisid) {
				tomb[aktfoszam].perspart[index] = { tart: szemelyt, kapcs: aktualisid, bevez: '' };
				tarolo = 1;
			}
		});
		if (tarolo === 0) {
			tomb[aktfoszam].perspart.push({ tart: szemelyt, kapcs: aktualisid, bevez: '' });
		}
		szoveg(tomb);
	});
	sajatalszamszamkent = sajatalszamszamkent + 1;
	techsajatalszamszamkent = sajatalszamszamkent - 1;
	if ($('#szj' + sajatfoszamszamkent + '_' + (sajatalszamszamkent - 1)).nextAll().eq(2)[0] === undefined) {
		$('#form' + sajatfoszamszamkent + '_' + techsajatalszamszamkent).after(
			'<select id="szj' +
				sajatfoszamszamkent +
				'_' +
				sajatalszamszamkent +
				'"class="custom-select mt-2 col-3 szemelyjellemzo mt-2 mb-2"><option value="valasztas">Add new feature</option><option value="perspart">Personal particulars</option><option value="conviction">Conviction</option><option value="ongoing">Ongoing procedure</option><option value="questioning">Questioned by the police</option><option value="control">Controlled by the police</option><option value="border">Border crossing</option><option value="case">Criminal case</option><option value="phone">Phone number</option><option value="documents">Document</option><option value="address">Address</option><option value="company">Company</option><option value="vehicle">Vehicle</option><option value="alias">Alias</option><option value="wanted">Wanted</option><option value="free">Free text</option></select>'
		);
	}
}

function conviction() {
	$('#' + sajatid).after(
		'<form class="" onsubmit="return false" id="form' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'"><div class="form-row"><input class="form-control mand col div mb-2 mr-sm-2 crime e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" placeholder="crime (mandatory)"><input class="form-control col div mand form-row mb-2 mr-sm-2 perpetration e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" placeholder="year of perpetr. (mandatory)"><input class="form-control col div mb-2 mr-sm-2 sentence e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" placeholder="sentenced to" value="of imprisonment"></div><legend class="col-form-label pt-0">Personal data of the accomplice(s)</legend><div class="form-row"><input class="form-control col-2 div mb-2 mr-sm-2 rugvez e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" placeholder="family name"><input class="form-control col-2 div mb-2 mr-sm-2 rugker e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" placeholder="given name"><input class="form-control col div mb-2 mr-sm-2 rugyear e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" placeholder="year of birth"><input class="form-control col div mb-2 mr-sm-2 rugmonth e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" placeholder="month of birth"><input class="form-control col div mb-2 mr-sm-2 rugday e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" placeholder="day of birth"><input class="form-control col-3 div mb-2 mr-sm-2 rugother e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" placeholder="other pers. data"><button type="button" id="b' +
			aktfoszam +
			'" onclick="koztesvegere(this)" class="ujsorbaszemely btn mr-2 btn-sm btn-info mb-2" data-toggle="tooltip" data-placement="top" title="Add this person as a new main object">@</button><button type="button" id="b' +
			aktfoszam +
			'" onclick="megegyszemely(this)" class="szempluszgomb btn mr-2 btn-sm btn-info mb-2" data-toggle="tooltip" data-placement="top" title="Add a new person to this feature">+</button></div><div class="form-row"><input class="form-control col div mb-2 mr-sm-2 free e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" placeholder="free text"><button type="button" id="b' +
			aktfoszam +
			'" onclick="featuretorles(this)" class="btn mr-2 btn-sm btn-outline-danger mb-2" data-toggle="tooltip" data-placement="top" title="Remove this feature">-</button><button type="submit" class="gomb btn btn-primary mb-2" id="e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'">Add</button></div></form>'
	);
	$('#e' + sajatfoszamszamkent + '_' + sajatalszamszamkent).on('click', function(prop) {
		prop.stopPropagation();
		$(this).text('Update');
		aktualisid = $(this).attr('id');
		aktfoszam = $(this).attr('id').slice(1, $(this).attr('id').indexOf('_'));
		nembeloves();
		var accomplices = szemelygen();
		if ($('.sentence.' + aktualisid).val() === 'of imprisonment' || $('.sentence.' + aktualisid).val() === '') {
			var sentencedto = '';
		} else {
			var sentencedto = neme + ' was sentenced to ' + $('.sentence.' + aktualisid).val() + '. ';
		}
		if (accomplices != '') {
			var accomplices = birtokosnemenagyb + ' known accomplice(s): ' + accomplices + '. ';
		}
		var eliteles =
			'Committed crime: ' +
			$('.crime.' + aktualisid).val() +
			', that ' +
			nemekisbetu +
			' committed in ' +
			$('.perpetration.' + aktualisid).val() +
			'. ' +
			sentencedto +
			accomplices +
			' ' +
			$('.free.' + aktualisid).val();
		if (tomb[aktfoszam].conviction === undefined) {
			tomb[aktfoszam].conviction = [];
		}
		tarolo = 0;
		tomb[aktfoszam].conviction.forEach(function(i, index) {
			if (i.kapcs === aktualisid) {
				tomb[aktfoszam].conviction[index] = {
					tart: eliteles,
					kapcs: aktualisid,
					bevez: 'This person has the following conviction(s): '
				};
				tarolo = 1;
			}
		});
		if (tarolo === 0) {
			tomb[aktfoszam].conviction.push({
				tart: eliteles,
				kapcs: aktualisid,
				bevez: 'This person has the following conviction(s): '
			});
		}
		szoveg(tomb);
	});
	sajatalszamszamkent = sajatalszamszamkent + 1;
	techsajatalszamszamkent = sajatalszamszamkent - 1;
	if ($('#szj' + sajatfoszamszamkent + '_' + (sajatalszamszamkent - 1)).nextAll().eq(2)[0] === undefined) {
		$('#form' + sajatfoszamszamkent + '_' + techsajatalszamszamkent).after(
			'<select id="szj' +
				sajatfoszamszamkent +
				'_' +
				sajatalszamszamkent +
				'"class="custom-select mt-2 col-3 szemelyjellemzo mt-2 mb-2"><option value="valasztas">Add new feature</option><option value="perspart">Personal particulars</option><option value="conviction">Conviction</option><option value="ongoing">Ongoing procedure</option><option value="questioning">Questioned by the police</option><option value="control">Controlled by the police</option><option value="border">Border crossing</option><option value="case">Criminal case</option><option value="phone">Phone number</option><option value="documents">Document</option><option value="address">Address</option><option value="company">Company</option><option value="vehicle">Vehicle</option><option value="alias">Alias</option><option value="wanted">Wanted</option><option value="free">Free text</option></select>'
		);
	}
}

function ongoing() {
	$('#' + sajatid).after(
		'<form class="" onsubmit="return false" id="form' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'"><div class="form-row"><input class="form-control mand col div mb-2 mr-sm-2 crime e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" placeholder="crime (mandatory)"><input class="form-control col div mb-2 mr-sm-2 punit e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" placeholder="police unit"><input class="form-control col-2 div mb-2 mr-sm-2 pcase e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" placeholder="case number"><input class="form-control col div mb-2 mr-sm-2 committed e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" placeholder="year of perpetration"><div class="form-check form-check-inline"><input type="checkbox" id="bforw e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" class="form-check-input bforw e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'"><label for="bforw e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" class="form-check-label">Request forwarded</label></div></div><legend class="col-form-label pt-0">Personal data of the accomplice(s)</legend><div class="form-row"><input class="form-control col-2 div mb-2 mr-sm-2 rugvez e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" placeholder="family name"><input class="form-control col-2 div mb-2 mr-sm-2 rugker e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" placeholder="given name"><input class="form-control col div mb-2 mr-sm-2 rugyear e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" placeholder="year of birth"><input class="form-control col div mb-2 mr-sm-2 rugmonth e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" placeholder="month of birth"><input class="form-control col div mb-2 mr-sm-2 rugday e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" placeholder="day of birth"><input class="form-control col-3 div mb-2 mr-sm-2 rugother e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" placeholder="other pers. data"><button type="button" id="b' +
			aktfoszam +
			'" onclick="koztesvegere(this)" class="ujsorbaszemely btn mr-2 btn-sm btn-info mb-2" data-toggle="tooltip" data-placement="top" title="Add this person as a new main object">@</button><button type="button" id="b' +
			aktfoszam +
			'" onclick="megegyszemely(this)" class="szempluszgomb btn mr-2 btn-sm btn-info mb-2" data-toggle="tooltip" data-placement="top" title="Add a new person to this feature">+</button></div><div class="form-row"><input class="form-control col div mb-2 mr-sm-2 free e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" placeholder="free text"><button type="button" id="b' +
			aktfoszam +
			'" onclick="featuretorles(this)" class="btn mr-2 btn-sm btn-outline-danger mb-2" data-toggle="tooltip" data-placement="top" title="Remove this feature">-</button><button type="submit" class="gomb btn btn-primary mb-2" id="e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'">Add</button></div></form>'
	);
	$('#e' + sajatfoszamszamkent + '_' + sajatalszamszamkent).on('click', function(prop) {
		prop.stopPropagation();
		$(this).text('Update');
		aktualisid = $(this).attr('id');
		aktfoszam = $(this).attr('id').slice(1, $(this).attr('id').indexOf('_'));
		nembeloves();
		var accomplices = szemelygen();
		if ($('.committed.' + aktualisid).val() != '') {
			var committed = 'The criminal act was committed in ' + $('.committed.' + aktualisid).val() + '. ';
		} else {
			var committed = '';
		}
		if (accomplices != '') {
			var accomplices = birtokosnemenagyb + ' known accomplice(s): ' + accomplices + '.';
		}
		if ($('.punit.' + aktualisid).val() != '') {
			var punit = 'The case is investigated by ' + $('.punit.' + aktualisid).val() + '. ';
		} else {
			var punit = '';
		}
		if ($('.pcase.' + aktualisid).val() != '') {
			var pcase = '(Case number: ' + $('.pcase.' + aktualisid).val() + '.) ';
		} else {
			var pcase = '';
		}
		if ($('.bforw.' + aktualisid)[0].checked === true) {
			var bforw =
				"We've forwarded your request to the competent police unit in order to evaluate it and to facilitate further information exchange. ";
		} else {
			var bforw = '';
		}
		var folyamat =
			'Crime: ' +
			$('.crime.' + aktualisid).val() +
			'. ' +
			committed +
			accomplices +
			' ' +
			punit +
			pcase +
			bforw +
			$('.free.' + aktualisid).val();
		if (tomb[aktfoszam].ongoing === undefined) {
			tomb[aktfoszam].ongoing = [];
		}
		tarolo = 0;
		tomb[aktfoszam].ongoing.forEach(function(i, index) {
			if (i.kapcs === aktualisid) {
				tomb[aktfoszam].ongoing[index] = {
					tart: folyamat,
					kapcs: aktualisid,
					bevez: 'This individual is a suspect in the(se) ongoing criminal procedure(s): '
				};
				tarolo = 1;
			}
		});
		if (tarolo === 0) {
			tomb[aktfoszam].ongoing.push({
				tart: folyamat,
				kapcs: aktualisid,
				bevez: 'This individual is a suspect in the(se) ongoing criminal procedure(s): '
			});
		}
		szoveg(tomb);
	});
	sajatalszamszamkent = sajatalszamszamkent + 1;
	techsajatalszamszamkent = sajatalszamszamkent - 1;
	if ($('#szj' + sajatfoszamszamkent + '_' + (sajatalszamszamkent - 1)).nextAll().eq(2)[0] === undefined) {
		$('#form' + sajatfoszamszamkent + '_' + techsajatalszamszamkent).after(
			'<select id="szj' +
				sajatfoszamszamkent +
				'_' +
				sajatalszamszamkent +
				'"class="custom-select mt-2 col-3 szemelyjellemzo mt-2 mb-2"><option value="valasztas">Add new feature</option><option value="perspart">Personal particulars</option><option value="conviction">Conviction</option><option value="ongoing">Ongoing procedure</option><option value="questioning">Questioned by the police</option><option value="control">Controlled by the police</option><option value="border">Border crossing</option><option value="case">Criminal case</option><option value="phone">Phone number</option><option value="documents">Document</option><option value="address">Address</option><option value="company">Company</option><option value="vehicle">Vehicle</option><option value="alias">Alias</option><option value="wanted">Wanted</option><option value="free">Free text</option></select>'
		);
	}
}

function questioning() {
	$('#' + sajatid).after(
		'<form class="" onsubmit="return false" id="form' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'"><div class="form-row"><input class="form-control mand col div mb-2 mr-sm-2 qtime e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" placeholder="year (or date, mandatory)"><input class="form-control mand col div mb-2 mr-sm-2 qclass e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" placeholder="classification (mandatory)"><select class="custom-select mb-2 mr-2 col-2 qrole e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'"><option value="role">status</option><option value="suspect">suspect</option><option value="victim">victim</option><option value="witness">witness</option><option value="denouncer">denouncer</option></select><input class="form-control col div mb-2 mr-sm-2 qaddress e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" placeholder="address provided"><input class="form-control col div mb-2 mr-sm-2 qphone e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" placeholder="phone nr. provided"></div><div class="form-row"><input class="form-control col div mb-2 mr-sm-2 qfree e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" placeholder="free text"><button type="button" id="b' +
			aktfoszam +
			'" onclick="featuretorles(this)" class="btn mr-2 btn-sm btn-outline-danger mb-2" data-toggle="tooltip" data-placement="top" title="Remove this feature">-</button><button type="submit" class="gomb btn btn-primary mb-2" id="e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'">Add</button><br></div></form>'
	);
	$('#e' + sajatfoszamszamkent + '_' + sajatalszamszamkent).on('click', function(prop) {
		prop.stopPropagation();
		$(this).text('Update');
		aktualisid = $(this).attr('id');
		aktfoszam = $(this).attr('id').slice(1, $(this).attr('id').indexOf('_'));
		nembeloves();
		if ($('.qclass.' + aktualisid).val() != '') {
			var qclass = 'Classification of the case: ' + $('.qclass.' + aktualisid).val();
		} else {
			var qclass = '';
		}
		if ($('.qtime.' + aktualisid).val() != '') {
			var qtime = ', interrogated in ' + $('.qtime.' + aktualisid).val();
		} else {
			var qtime = '';
		}
		if ($('.qrole.' + aktualisid).val() != 'role') {
			var qrole = ' as a ' + $('.qrole.' + aktualisid).val() + '. ';
		} else {
			var qrole = '';
		}
		if ($('.qphone.' + aktualisid).val() != '') {
			var qphone =
				'That time ' +
				nemekisbetu +
				' provided the police with this phone number: ' +
				$('.qphone.' + aktualisid).val() +
				'. ';
		} else {
			var qphone = '';
		}
		if ($('.qaddress.' + aktualisid).val() != '') {
			var qaddress =
				neme +
				' indicated this address as ' +
				birtokosneme +
				' residence: ' +
				$('.qaddress.' + aktualisid).val() +
				'. ';
		} else {
			var qaddress = '';
		}
		var kikerd = qclass + qtime + qrole + qphone + qaddress + $('.qfree.' + aktualisid).val();
		if (tomb[aktfoszam].questioning === undefined) {
			tomb[aktfoszam].questioning = [];
		}
		tarolo = 0;
		tomb[aktfoszam].questioning.forEach(function(i, index) {
			if (i.kapcs === aktualisid) {
				tomb[aktfoszam].questioning[index] = {
					tart: kikerd,
					kapcs: aktualisid,
					bevez: 'This individual was questioned by the police in the latter case(s): '
				};
				tarolo = 1;
			}
		});
		if (tarolo === 0) {
			tomb[aktfoszam].questioning.push({
				tart: kikerd,
				kapcs: aktualisid,
				bevez: 'This individual was questioned by the police in the latter case(s): '
			});
		}
		szoveg(tomb);
	});
	sajatalszamszamkent = sajatalszamszamkent + 1;
	techsajatalszamszamkent = sajatalszamszamkent - 1;
	if ($('#szj' + sajatfoszamszamkent + '_' + (sajatalszamszamkent - 1)).nextAll().eq(2)[0] === undefined) {
		$('#form' + sajatfoszamszamkent + '_' + techsajatalszamszamkent).after(
			'<select id="szj' +
				sajatfoszamszamkent +
				'_' +
				sajatalszamszamkent +
				'"class="custom-select mt-2 col-3 szemelyjellemzo mt-2 mb-2"><option value="valasztas">Add new feature</option><option value="perspart">Personal particulars</option><option value="conviction">Conviction</option><option value="ongoing">Ongoing procedure</option><option value="questioning">Questioned by the police</option><option value="control">Controlled by the police</option><option value="border">Border crossing</option><option value="case">Criminal case</option><option value="phone">Phone number</option><option value="documents">Document</option><option value="address">Address</option><option value="company">Company</option><option value="vehicle">Vehicle</option><option value="alias">Alias</option><option value="wanted">Wanted</option><option value="free">Free text</option></select>'
		);
	}
}

function control() {
	$('#' + sajatid).after(
		'<form class="" onsubmit="return false" id="form' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'"><div class="form-row"><input class="form-control mand col div mb-2 mr-sm-2 cplace e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" placeholder="place (mandatory)"><input class="form-control mand col div mb-2 mr-sm-2 ctime e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" placeholder="date (mandatory)"><input class="form-control col div mb-2 mr-sm-2 cvehicle e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" placeholder="vehicle" value="l/p: "><input class="form-control col div mb-2 mr-sm-2 cphone e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" placeholder="phone number"></div><legend class="col-form-label pt-0">Other controlled person(s)</legend><div class="form-row"><input class="form-control col-2 div mb-2 mr-sm-2 rugvez e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" placeholder="family name"><input class="form-control col-2 div mb-2 mr-sm-2 rugker e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" placeholder="given name"><input class="form-control col div mb-2 mr-sm-2 rugyear e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" placeholder="year of birth"><input class="form-control col div mb-2 mr-sm-2 rugmonth e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" placeholder="month of birth"><input class="form-control col div mb-2 mr-sm-2 rugday e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" placeholder="day of birth"><input class="form-control col-3 div mb-2 mr-sm-2 rugother e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" placeholder="other pers. data"><button type="button" id="b' +
			aktfoszam +
			'" onclick="koztesvegere(this)" class="ujsorbaszemely btn mr-2 btn-sm btn-info mb-2" data-toggle="tooltip" data-placement="top" title="Add this person as a new main object">@</button><button type="button" id="b' +
			aktfoszam +
			'" onclick="megegyszemely(this)" class="szempluszgomb btn mr-2 btn-sm btn-info mb-2" data-toggle="tooltip" data-placement="top" title="Add a new person to this feature">+</button></div><div class="form-row"><input class="form-control col div mb-2 mr-sm-2 free e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" placeholder="free text"><button type="button" id="b' +
			aktfoszam +
			'" onclick="featuretorles(this)" class="btn mr-2 btn-sm btn-outline-danger mb-2" data-toggle="tooltip" data-placement="top" title="Remove this feature">-</button><button type="submit" class="gomb btn btn-primary mb-2" id="e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'">Add</button></div></form>'
	);
	$('#e' + sajatfoszamszamkent + '_' + sajatalszamszamkent).on('click', function(prop) {
		prop.stopPropagation();
		$(this).text('Update');
		aktualisid = $(this).attr('id');
		aktfoszam = $(this).attr('id').slice(1, $(this).attr('id').indexOf('_'));
		nembeloves();
		var cother = szemelygen();
		var chelyido = ' In ' + $('.cplace.' + aktualisid).val() + ' on ' + $('.ctime.' + aktualisid).val() + '. ';
		if ($('.cvehicle.' + aktualisid).val() === '' || $('.cvehicle.' + aktualisid).val() === 'l/p: ') {
			var cvehicle = '';
		} else {
			var cvehicle = neme + ' used the vehicle: ' + $('.cvehicle.' + aktualisid).val() + '. ';
		}
		if ($('.cphone.' + aktualisid).val() != '') {
			var cphone =
				'During the control ' +
				nemekisbetu +
				' provided this phone number: ' +
				$('.cphone.' + aktualisid).val() +
				' as ' +
				birtokosneme +
				' own one. ';
		} else {
			var cphone = '';
		}
		if (cother != '') {
			var cother = neme + ' was together with the following person(s) during the control: ' + cother + '. ';
		}
		var kontr = chelyido + cvehicle + cphone + cother + ' ' + $('.free.' + aktualisid).val();
		if (tomb[aktfoszam].polcontroll === undefined) {
			tomb[aktfoszam].polcontroll = [];
		}
		tarolo = 0;
		tomb[aktfoszam].polcontroll.forEach(function(i, index) {
			if (i.kapcs === aktualisid) {
				tomb[aktfoszam].polcontroll[index] = {
					tart: kontr,
					kapcs: aktualisid,
					bevez: 'This person was controlled by the police: '
				};
				tarolo = 1;
			}
		});
		if (tarolo === 0) {
			tomb[aktfoszam].polcontroll.push({
				tart: kontr,
				kapcs: aktualisid,
				bevez: 'This person was controlled by the police: '
			});
		}
		szoveg(tomb);
	});
	sajatalszamszamkent = sajatalszamszamkent + 1;
	techsajatalszamszamkent = sajatalszamszamkent - 1;
	if ($('#szj' + sajatfoszamszamkent + '_' + (sajatalszamszamkent - 1)).nextAll().eq(2)[0] === undefined) {
		$('#form' + sajatfoszamszamkent + '_' + techsajatalszamszamkent).after(
			'<select id="szj' +
				sajatfoszamszamkent +
				'_' +
				sajatalszamszamkent +
				'"class="custom-select mt-2 col-3 szemelyjellemzo mt-2 mb-2"><option value="valasztas">Add new feature</option><option value="perspart">Personal particulars</option><option value="conviction">Conviction</option><option value="ongoing">Ongoing procedure</option><option value="questioning">Questioned by the police</option><option value="control">Controlled by the police</option><option value="border">Border crossing</option><option value="case">Criminal case</option><option value="phone">Phone number</option><option value="documents">Document</option><option value="address">Address</option><option value="company">Company</option><option value="vehicle">Vehicle</option><option value="alias">Alias</option><option value="wanted">Wanted</option><option value="free">Free text</option></select>'
		);
	}
}

function borderc() {
	$('#' + sajatid).after(
		'<form class="" onsubmit="return false" id="form' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'"><div class="form-row"><input class="form-control mand col div mb-2 mr-sm-2 bccountry e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" placeholder="country (mandatory)"><input class="form-control mand col div mb-2 mr-sm-2 bcplace e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" placeholder="place (mandatory)"><select class="custom-select mand mb-2 mr-2 col-2 bcdir e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'"><option value="direction">direction (mandatory)</option><option value="entered my country">entered my country</option><option value="left my country">left my country</option></select><input class="form-control col div mb-2 mr-sm-2 bcdate e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" placeholder="date"><input class="form-control col div mb-2 mr-sm-2 bcvehicle e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" value="l/p: "></div><legend class="col-form-label pt-0">Personal data of the co-travellers</legend><div class="form-row"><input class="form-control col-2 div mb-2 mr-sm-2 rugvez e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" placeholder="family name"><input class="form-control col-2 div mb-2 mr-sm-2 rugker e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" placeholder="given name"><input class="form-control col div mb-2 mr-sm-2 rugyear e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" placeholder="year of birth"><input class="form-control col div mb-2 mr-sm-2 rugmonth e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" placeholder="month of birth"><input class="form-control col div mb-2 mr-sm-2 rugday e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" placeholder="day of birth"><input class="form-control col-3 div mb-2 mr-sm-2 rugother e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" placeholder="other pers. data"><button type="button" id="b' +
			aktfoszam +
			'" onclick="koztesvegere(this)" class="ujsorbaszemely btn mr-2 btn-sm btn-info mb-2" data-toggle="tooltip" data-placement="top" title="Add this person as a new main object">@</button><button type="button" id="b' +
			aktfoszam +
			'" onclick="megegyszemely(this)" class="szempluszgomb btn mr-2 btn-sm btn-info mb-2" data-toggle="tooltip" data-placement="top" title="Add a new person to this feature">+</button></div><div class="form-row"><div class="form-check form-check-inline"><input type="checkbox" class="form-check-input nocot e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" id="nocot e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'"><label class="form-check-label" for="nocot e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'">No co-travellers </label></div><input class="form-control col div mb-2 mr-sm-2 free e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" placeholder="free text"><button type="button" id="b' +
			aktfoszam +
			'" onclick="featuretorles(this)" class="btn mr-2 btn-sm btn-outline-danger mb-2" data-toggle="tooltip" data-placement="top" title="Remove this feature">-</button><button type="submit" class="gomb btn btn-primary mb-2" id="e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'">Add</button><br></div></form>'
	);
	$('#e' + sajatfoszamszamkent + '_' + sajatalszamszamkent).on('click', function(prop) {
		prop.stopPropagation();
		$(this).text('Update');
		aktualisid = $(this).attr('id');
		aktfoszam = $(this).attr('id').slice(1, $(this).attr('id').indexOf('_'));
		nembeloves();
		var cotrav = szemelygen();
		var bcalap =
			neme +
			' ' +
			$('.bcdir.' + aktualisid).val() +
			' at ' +
			$('.bcplace.' + aktualisid).val() +
			' (border between my country and ' +
			$('.bccountry.' + aktualisid).val() +
			'). ';
		if ($('.bcdate.' + aktualisid).val() != '') {
			var bcdate = 'The crossing took place on ' + $('.bcdate.' + aktualisid).val() + '. ';
		} else {
			var bcdate = '';
		}
		if ($('.bcvehicle.' + aktualisid).val() === '' || $('.bcvehicle.' + aktualisid).val() === 'l/p: ') {
			var bcvehicle = '';
		} else {
			var bcvehicle = neme + ' used the vehicle ' + $('.bcvehicle.' + aktualisid).val() + '. ';
		}
		if (cotrav != '') {
			cotrav = 'Registered co-traveller(s): ' + cotrav + '. ';
		}
		if ($('.nocot.' + aktualisid)[0].checked === true) {
			var nocot =
				' No co-travellers were registered related to this border crossing. Please take note that this does not fully exclude the possibility of the existence of potential co-travellers. ';
		} else {
			var nocot = '';
		}
		var bordc = bcalap + bcdate + bcvehicle + cotrav + nocot + $('.free.' + aktualisid).val();
		if (tomb[aktfoszam].hataratlep === undefined) {
			tomb[aktfoszam].hataratlep = [];
		}
		tarolo = 0;
		tomb[aktfoszam].hataratlep.forEach(function(i, index) {
			if (i.kapcs === aktualisid) {
				tomb[aktfoszam].hataratlep[index] = {
					tart: bordc,
					kapcs: aktualisid,
					bevez: 'The following border crossing(s) of this individual were registered: '
				};
				tarolo = 1;
			}
		});
		if (tarolo === 0) {
			tomb[aktfoszam].hataratlep.push({
				tart: bordc,
				kapcs: aktualisid,
				bevez: 'The following border crossing(s) of this individual were registered: '
			});
		}
		szoveg(tomb);
	});
	sajatalszamszamkent = sajatalszamszamkent + 1;
	techsajatalszamszamkent = sajatalszamszamkent - 1;
	if ($('#szj' + sajatfoszamszamkent + '_' + (sajatalszamszamkent - 1)).nextAll().eq(2)[0] === undefined) {
		$('#form' + sajatfoszamszamkent + '_' + techsajatalszamszamkent).after(
			'<select id="szj' +
				sajatfoszamszamkent +
				'_' +
				sajatalszamszamkent +
				'"class="custom-select mt-2 col-3 szemelyjellemzo mt-2 mb-2"><option value="valasztas">Add new feature</option><option value="perspart">Personal particulars</option><option value="conviction">Conviction</option><option value="ongoing">Ongoing procedure</option><option value="questioning">Questioned by the police</option><option value="control">Controlled by the police</option><option value="border">Border crossing</option><option value="case">Criminal case</option><option value="phone">Phone number</option><option value="documents">Document</option><option value="address">Address</option><option value="company">Company</option><option value="vehicle">Vehicle</option><option value="alias">Alias</option><option value="wanted">Wanted</option><option value="free">Free text</option></select>'
		);
	}
}

function phone() {
	$('#' + sajatid).after(
		'<form class="" onsubmit="return false" id="form' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'"><div class="form-row"><input class="form-control mand col div mb-2 mr-sm-2 pphone e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" placeholder="phone number (mandatory)"><input class="form-control col div mb-2 mr-sm-2 pdate e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" placeholder="date of record"><input class="form-control col div mb-2 mr-sm-2 psource e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" placeholder="source"></div><div class="form-row"><input class="form-control col div mb-2 mr-sm-2 pfree e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" placeholder="free text"><button type="button" id="b' +
			aktfoszam +
			'" onclick="featuretorles(this)" class="btn mr-2 btn-sm btn-outline-danger mb-2" data-toggle="tooltip" data-placement="top" title="Remove this feature">-</button><button type="submit" class="gomb btn btn-primary mb-2" id="e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'">Add</button><br></div></form>'
	);
	$('#e' + sajatfoszamszamkent + '_' + sajatalszamszamkent).on('click', function(prop) {
		prop.stopPropagation();
		$(this).text('Update');
		aktualisid = $(this).attr('id');
		aktfoszam = $(this).attr('id').slice(1, $(this).attr('id').indexOf('_'));
		var normalizalt = $('.pphone.' + aktualisid).val().replace(/\D/g, '');
		var palap = normalizalt + '. ';
		if ($('.pdate.' + aktualisid).val() != '') {
			var pdate = ' The date of registry is: ' + $('.pdate.' + aktualisid).val() + '. ';
		} else {
			var pdate = '';
		}
		if ($('.psource.' + aktualisid).val() != '') {
			var psource = 'The source of this record is ' + $('.psource.' + aktualisid).val() + '. ';
		} else {
			var psource = '';
		}
		var telosz = palap + pdate + psource + $('.pfree.' + aktualisid).val();
		if (tomb[aktfoszam].telefon === undefined) {
			tomb[aktfoszam].telefon = [];
		}
		tarolo = 0;
		tomb[aktfoszam].telefon.forEach(function(i, index) {
			if (i.kapcs === aktualisid) {
				tomb[aktfoszam].telefon[index] = {
					tart: telosz,
					kapcs: aktualisid,
					bevez: 'We have the following phone number(s) registered to this individual: '
				};
				tarolo = 1;
			}
		});
		if (tarolo === 0) {
			tomb[aktfoszam].telefon.push({
				tart: telosz,
				kapcs: aktualisid,
				bevez: 'We have the following phone number(s) registered to this individual: '
			});
		}
		szoveg(tomb);
	});
	sajatalszamszamkent = sajatalszamszamkent + 1;
	techsajatalszamszamkent = sajatalszamszamkent - 1;
	if ($('#szj' + sajatfoszamszamkent + '_' + (sajatalszamszamkent - 1)).nextAll().eq(2)[0] === undefined) {
		$('#form' + sajatfoszamszamkent + '_' + techsajatalszamszamkent).after(
			'<select id="szj' +
				sajatfoszamszamkent +
				'_' +
				sajatalszamszamkent +
				'"class="custom-select mt-2 col-3 szemelyjellemzo mt-2 mb-2"><option value="valasztas">Add new feature</option><option value="perspart">Personal particulars</option><option value="conviction">Conviction</option><option value="ongoing">Ongoing procedure</option><option value="questioning">Questioned by the police</option><option value="control">Controlled by the police</option><option value="border">Border crossing</option><option value="case">Criminal case</option><option value="phone">Phone number</option><option value="documents">Document</option><option value="address">Address</option><option value="company">Company</option><option value="vehicle">Vehicle</option><option value="alias">Alias</option><option value="wanted">Wanted</option><option value="free">Free text</option></select>'
		);
	}
}

function documents() {
	$('#' + sajatid).after(
		'<form class="" onsubmit="return false" id="form' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'"><div class="form-row"><select class="custom-select mand col-2 mb-2 mr-2 dtypep e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'"><option value="valasztas">Type (mandatory)</option><option value="passport">Passport</option><option value="ID card">ID card</option><option value="driving license">Driving license</option><option value="residence permit">Residence permit</option></select><input class="form-control col div mb-2 mr-sm-2 idnumberp e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" placeholder="ident. number of document"><input class="form-control col div mb-2 mr-sm-2 dissuedp e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" placeholder="issued by"><input class="form-control col div mb-2 mr-sm-2 dissuedonp e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" placeholder="issued on"><input class="form-control col div mb-2 mr-sm-2 dvalidp e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" placeholder="valid until"></div><div class="form-row"><div class="form-check form-check-inline"><input type="checkbox" id="pattachp e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" class="form-check-input pattachp e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'"><label class ="form-check-label" for="pattachp e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'">Photo enclosed</label></div><input class="form-control col div mb-2 mr-sm-2 dfreep e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" placeholder="free text"><button type="button" id="b' +
			aktfoszam +
			'" onclick="featuretorles(this)" class="btn mr-2 btn-sm btn-outline-danger mb-2" data-toggle="tooltip" data-placement="top" title="Remove this feature">-</button><button type="submit" class="gomb btn btn-primary mb-2" id="e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'">Add</button><br></div></form>'
	);
	$('#e' + sajatfoszamszamkent + '_' + sajatalszamszamkent).on('click', function(prop) {
		prop.stopPropagation();
		$(this).text('Update');
		aktualisid = $(this).attr('id');
		aktfoszam = $(this).attr('id').slice(1, $(this).attr('id').indexOf('_'));
		var docpalap = 'Type of document: ' + $('.dtypep.' + aktualisid).val();
		if ($('.idnumberp.' + aktualisid).val() != '') {
			var idnumberp = ', its number: ' + $('.idnumberp.' + aktualisid).val();
		} else {
			var idnumberp = '';
		}
		if ($('.dissuedp.' + aktualisid).val() != '') {
			var dissuedp = ', issued by: ' + $('.dissuedp.' + aktualisid).val();
		} else {
			var dissuedp = '';
		}
		if ($('.dissuedonp.' + aktualisid).val() != '') {
			var dissuedonp = ', issued on: ' + $('.dissuedonp.' + aktualisid).val();
		} else {
			var dissuedonp = '';
		}
		if ($('.dvalidp.' + aktualisid).val() != '') {
			var dvalidp = ', valid until: ' + $('.dvalidp.' + aktualisid).val();
		} else {
			var dvalidp = '';
		}
		if ($('.pattachp.' + aktualisid)[0].checked === true) {
			var pattachp = 'Please find the photo related to this document attached. ';
		} else {
			var pattachp = '';
		}
		var dokszovegp =
			docpalap + idnumberp + dissuedp + dissuedonp + dvalidp + '. ' + pattachp + $('.dfreep.' + aktualisid).val();
		if (tomb[aktfoszam].docs === undefined) {
			tomb[aktfoszam].docs = [];
		}
		tarolo = 0;
		tomb[aktfoszam].docs.forEach(function(i, index) {
			if (i.kapcs === aktualisid) {
				tomb[aktfoszam].docs[index] = {
					tart: dokszovegp,
					kapcs: aktualisid,
					bevez: 'This person has the following personal document(s): '
				};
				tarolo = 1;
			}
		});
		if (tarolo === 0) {
			tomb[aktfoszam].docs.push({
				tart: dokszovegp,
				kapcs: aktualisid,
				bevez: 'This person has the following personal document(s): '
			});
		}
		szoveg(tomb);
	});
	sajatalszamszamkent = sajatalszamszamkent + 1;
	techsajatalszamszamkent = sajatalszamszamkent - 1;
	if ($('#szj' + sajatfoszamszamkent + '_' + (sajatalszamszamkent - 1)).nextAll().eq(2)[0] === undefined) {
		$('#form' + sajatfoszamszamkent + '_' + techsajatalszamszamkent).after(
			'<select id="szj' +
				sajatfoszamszamkent +
				'_' +
				sajatalszamszamkent +
				'"class="custom-select mt-2 col-3 szemelyjellemzo mt-2 mb-2"><option value="valasztas">Add new feature</option><option value="perspart">Personal particulars</option><option value="conviction">Conviction</option><option value="ongoing">Ongoing procedure</option><option value="questioning">Questioned by the police</option><option value="control">Controlled by the police</option><option value="border">Border crossing</option><option value="case">Criminal case</option><option value="phone">Phone number</option><option value="documents">Document</option><option value="address">Address</option><option value="company">Company</option><option value="vehicle">Vehicle</option><option value="alias">Alias</option><option value="wanted">Wanted</option><option value="free">Free text</option></select>'
		);
	}
}

function address() {
	$('#' + sajatid).after(
		'<form class="" onsubmit="return false" id="form' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'"><div class="form-row"><input class="form-control mand col-6 div mb-2 mr-sm-2 paddress e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" placeholder="address (mandatory)"><select class="custom-select mb-2 mr-2 col-3 ptemp e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'"><option value="">temporary/permanent/provided</option><option value="temporary address">temporary address</option><option value="permanent residence">permanent residence</option><option value="provided residence">provided residence</option></select><input class="form-control col div mb-2 mr-sm-2 psince e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" placeholder="since / date of prov."></div><div class="form-row"><input class="form-control col div mb-2 mr-sm-2 pfree e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" placeholder="free text"><button type="button" id="b' +
			aktfoszam +
			'" onclick="featuretorles(this)" class="btn mr-2 btn-sm btn-outline-danger mb-2" data-toggle="tooltip" data-placement="top" title="Remove this feature">-</button><button type="submit" class="gomb btn btn-primary mb-2" id="e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'">Add</button><br></div></form>'
	);
	$('#e' + sajatfoszamszamkent + '_' + sajatalszamszamkent).on('click', function(prop) {
		prop.stopPropagation();
		$(this).text('Update');
		aktualisid = $(this).attr('id');
		aktfoszam = $(this).attr('id').slice(1, $(this).attr('id').indexOf('_'));
		nembeloves();
		var aalap = "'" + $('.paddress.' + aktualisid).val() + "' ";
		if ($('.ptemp.' + aktualisid).val() != '') {
			var ptemp = 'was registered as ' + birtokosneme + ' ' + $('.ptemp.' + aktualisid).val() + '. ';
		} else {
			var ptemp = '';
		}
		if ($('.psince.' + aktualisid).val() != '') {
			var psince = ' It was registered on ' + $('.psince.' + aktualisid).val() + '. ';
		} else {
			var psince = '';
		}
		if ($('.ptemp.' + aktualisid).val() != '' && $('.ptemp.' + aktualisid).val() === 'provided residence') {
			var ptemp =
				'This person provided the police with the address: ' +
				"'" +
				$('.paddress.' + aktualisid).val() +
				"'" +
				' as ' +
				birtokosneme +
				' availability.';
			var aalap = '';
			if ($('.psince.' + aktualisid).val() != '') {
				var psince = ' ' + neme + ' provided it on ' + $('.psince.' + aktualisid).val() + '. ';
			} else {
				var psince = '';
			}
		}
		var cim = aalap + ptemp + psince + $('.pfree.' + aktualisid).val();
		if (tomb[aktfoszam].cimek === undefined) {
			tomb[aktfoszam].cimek = [];
		}
		tarolo = 0;
		tomb[aktfoszam].cimek.forEach(function(i, index) {
			if (i.kapcs === aktualisid) {
				tomb[aktfoszam].cimek[index] = {
					tart: cim,
					kapcs: aktualisid,
					bevez: 'The next address(es) are related to the mentioned individual: '
				};
				tarolo = 1;
			}
		});
		if (tarolo === 0) {
			tomb[aktfoszam].cimek.push({
				tart: cim,
				kapcs: aktualisid,
				bevez: 'The next address(es) are related to the mentioned individual: '
			});
		}
		szoveg(tomb);
	});
	sajatalszamszamkent = sajatalszamszamkent + 1;
	techsajatalszamszamkent = sajatalszamszamkent - 1;
	if ($('#szj' + sajatfoszamszamkent + '_' + (sajatalszamszamkent - 1)).nextAll().eq(2)[0] === undefined) {
		$('#form' + sajatfoszamszamkent + '_' + techsajatalszamszamkent).after(
			'<select id="szj' +
				sajatfoszamszamkent +
				'_' +
				sajatalszamszamkent +
				'"class="custom-select mt-2 col-3 szemelyjellemzo mt-2 mb-2"><option value="valasztas">Add new feature</option><option value="perspart">Personal particulars</option><option value="conviction">Conviction</option><option value="ongoing">Ongoing procedure</option><option value="questioning">Questioned by the police</option><option value="control">Controlled by the police</option><option value="border">Border crossing</option><option value="case">Criminal case</option><option value="phone">Phone number</option><option value="documents">Document</option><option value="address">Address</option><option value="company">Company</option><option value="vehicle">Vehicle</option><option value="alias">Alias</option><option value="wanted">Wanted</option><option value="free">Free text</option></select>'
		);
	}
}

function company() {
	$('#' + sajatid).after(
		'<form class="" onsubmit="return false" id="form' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'"><div class="form-row"><input class="form-control mand col div mb-2 mr-sm-2 pcompany e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" placeholder="company name (mandatory)"><div class="form-check form-check-inline"><input type="checkbox" id="pattach e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" class="form-check-input pattach e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'"><label class ="form-check-label" for="pattach e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'">Company certificate enclosed</label></div></div><div class="form-row"><input class="form-control col div mb-2 mr-sm-2 pfree e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" placeholder="free text"><button type="button" id="b' +
			aktfoszam +
			'" onclick="featuretorles(this)" class="btn mr-2 btn-sm btn-outline-danger mb-2" data-toggle="tooltip" data-placement="top" title="Remove this feature">-</button><button type="submit" class="gomb btn btn-primary mb-2" id="e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'">Add</button><br></div></form>'
	);
	$('#e' + sajatfoszamszamkent + '_' + sajatalszamszamkent).on('click', function(prop) {
		prop.stopPropagation();
		$(this).text('Update');
		aktualisid = $(this).attr('id');
		aktfoszam = $(this).attr('id').slice(1, $(this).attr('id').indexOf('_'));
		var calap = $('.pcompany.' + aktualisid).val() + '. ';
		if ($('.pattach.' + aktualisid)[0].checked === true) {
			var pattach =
				' Please find the company certificate - containing all the available data, such as the personal particulars of the owner(s) - attached in English. ';
		} else {
			var pattach = '';
		}
		var cegek = calap + $('.pfree.' + aktualisid).val() + pattach;
		if (tomb[aktfoszam].ceges === undefined) {
			tomb[aktfoszam].ceges = [];
		}
		tarolo = 0;
		tomb[aktfoszam].ceges.forEach(function(i, index) {
			if (i.kapcs === aktualisid) {
				tomb[aktfoszam].ceges[index] = {
					tart: cegek,
					kapcs: aktualisid,
					bevez: 'According to the company register, the concerned person is a member of the company(s): '
				};
				tarolo = 1;
			}
		});
		if (tarolo === 0) {
			tomb[aktfoszam].ceges.push({
				tart: cegek,
				kapcs: aktualisid,
				bevez: 'According to the company register, the concerned person is a member of the company(s): '
			});
		}
		szoveg(tomb);
	});
	sajatalszamszamkent = sajatalszamszamkent + 1;
	techsajatalszamszamkent = sajatalszamszamkent - 1;
	if ($('#szj' + sajatfoszamszamkent + '_' + (sajatalszamszamkent - 1)).nextAll().eq(2)[0] === undefined) {
		$('#form' + sajatfoszamszamkent + '_' + techsajatalszamszamkent).after(
			'<select id="szj' +
				sajatfoszamszamkent +
				'_' +
				sajatalszamszamkent +
				'"class="custom-select mt-2 col-3 szemelyjellemzo mt-2 mb-2"><option value="valasztas">Add new feature</option><option value="perspart">Personal particulars</option><option value="conviction">Conviction</option><option value="ongoing">Ongoing procedure</option><option value="questioning">Questioned by the police</option><option value="control">Controlled by the police</option><option value="border">Border crossing</option><option value="case">Criminal case</option><option value="phone">Phone number</option><option value="documents">Document</option><option value="address">Address</option><option value="company">Company</option><option value="vehicle">Vehicle</option><option value="alias">Alias</option><option value="wanted">Wanted</option><option value="free">Free text</option></select>'
		);
	}
}

function incase() {
	$('#' + sajatid).after(
		'<form class="" onsubmit="return false" id="form' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'"><div class="form-row"><input class="form-control mand col div mb-2 mr-sm-2 pcrime e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" placeholder="crime (mandatory)"><input class="form-control col div mb-2 mr-sm-2 punit e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" placeholder="police unit"><input class="form-control col-2 div mb-2 mr-sm-2 pcase e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" placeholder="case number"><input class="form-control col div mb-2 mr-sm-2 prole e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" placeholder="role in the case"><input class="form-control col div mb-2 mr-sm-2 pdate e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" placeholder="investigation started in year"></div><div class="form-row"><input class="form-control col div mb-2 mr-sm-2 pforw e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" placeholder="request forwarded to, why"><input class="form-control col-6 div mb-2 mr-sm-2 pfree e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" placeholder="free text"><button type="button" id="b' +
			aktfoszam +
			'" onclick="featuretorles(this)" class="btn mr-2 btn-sm btn-outline-danger mb-2" data-toggle="tooltip" data-placement="top" title="Remove this feature">-</button><button type="submit" class="gomb btn btn-primary mb-2" id="e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'">Add</button><br></div></form>'
	);
	$('#e' + sajatfoszamszamkent + '_' + sajatalszamszamkent).on('click', function(prop) {
		prop.stopPropagation();
		$(this).text('Update');
		aktualisid = $(this).attr('id');
		aktfoszam = $(this).attr('id').slice(1, $(this).attr('id').indexOf('_'));
		nembeloves();
		var calap = ' conducted upon the suspicion of ' + $('.pcrime.' + aktualisid).val() + '. ';
		if ($('.punit.' + aktualisid).val() != '') {
			var punit = ' investigated by the ' + $('.punit.' + aktualisid).val() + ',';
		} else {
			var punit = '';
		}
		if ($('.pcase.' + aktualisid).val() != '') {
			var pcase = '(Case nr. ' + $('.pcase.' + aktualisid).val() + '.) ';
		} else {
			var pcase = '';
		}
		if ($('.prole.' + aktualisid).val() != '') {
			var prole = birtokosnemenagyb + ' legal status was: ' + $('.prole.' + aktualisid).val() + '. ';
		} else {
			var prole = '';
		}
		if ($('.pdate.' + aktualisid).val() != '') {
			var pdate = 'The investigation was commenced in ' + $('.pdate.' + aktualisid).val() + '. ';
		} else {
			var pdate = '';
		}
		if ($('.pforw.' + aktualisid).val() != '') {
			var pforw = 'We forwarded your request to ' + $('.pforw.' + aktualisid).val() + '. ';
		} else {
			var pforw = '';
		}
		var ugyszov =
			neme +
			' emerged in a criminal investigation' +
			punit +
			calap +
			prole +
			pcase +
			pdate +
			pforw +
			$('.pfree.' + aktualisid).val();
		if (tomb[aktfoszam].havecase === undefined) {
			tomb[aktfoszam].havecase = [];
		}
		tarolo = 0;
		tomb[aktfoszam].havecase.forEach(function(i, index) {
			if (i.kapcs === aktualisid) {
				tomb[aktfoszam].havecase[index] = {
					tart: ugyszov,
					kapcs: aktualisid,
					bevez: 'This person appeared in the latter criminal case(s): '
				};
				tarolo = 1;
			}
		});
		if (tarolo === 0) {
			tomb[aktfoszam].havecase.push({
				tart: ugyszov,
				kapcs: aktualisid,
				bevez: 'This person appeared in the latter criminal case(s): '
			});
		}
		szoveg(tomb);
	});
	sajatalszamszamkent = sajatalszamszamkent + 1;
	techsajatalszamszamkent = sajatalszamszamkent - 1;
	if ($('#szj' + sajatfoszamszamkent + '_' + (sajatalszamszamkent - 1)).nextAll().eq(2)[0] === undefined) {
		$('#form' + sajatfoszamszamkent + '_' + techsajatalszamszamkent).after(
			'<select id="szj' +
				sajatfoszamszamkent +
				'_' +
				sajatalszamszamkent +
				'"class="custom-select mt-2 col-3 szemelyjellemzo mt-2 mb-2"><option value="valasztas">Add new feature</option><option value="perspart">Personal particulars</option><option value="conviction">Conviction</option><option value="ongoing">Ongoing procedure</option><option value="questioning">Questioned by the police</option><option value="control">Controlled by the police</option><option value="border">Border crossing</option><option value="case">Criminal case</option><option value="phone">Phone number</option><option value="documents">Document</option><option value="address">Address</option><option value="company">Company</option><option value="vehicle">Vehicle</option><option value="alias">Alias</option><option value="wanted">Wanted</option><option value="free">Free text</option></select>'
		);
	}
}

function vehicle() {
	$('#' + sajatid).after(
		'<form class="" onsubmit="return false" id="form' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'"><div class="form-row"><input class="form-control mand col div mb-2 mr-sm-2 plp e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" placeholder="license plate (mandatory)"><select class="custom-select mand mb-2 mr-2 col-3 powner e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'"><option value="">owner / registered user (mand.)</option><option value="owner">owner</option><option value="registered user">registered user</option></select><input class="form-control col div mb-2 mr-sm-2 vsince e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" placeholder="since"><input class="form-control col div mb-2 mr-sm-2 vbrand e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" placeholder="brand of the vehicle"></div><div class="form-row"><input class="form-control col div mb-2 mr-sm-2 pfree e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" placeholder="free text"><button type="button" id="b' +
			aktfoszam +
			'" onclick="featuretorles(this)" class="btn mr-2 btn-sm btn-outline-danger mb-2" data-toggle="tooltip" data-placement="top" title="Remove this feature">-</button><button type="submit" class="gomb btn btn-primary mb-2" id="e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'">Add</button><br></div></form>'
	);
	$('#e' + sajatfoszamszamkent + '_' + sajatalszamszamkent).on('click', function(prop) {
		prop.stopPropagation();
		$(this).text('Update');
		aktualisid = $(this).attr('id');
		aktfoszam = $(this).attr('id').slice(1, $(this).attr('id').indexOf('_'));
		var valap =
			$('.powner.' + aktualisid).val() +
			' of the vehicle l/p ' +
			$('.plp.' + aktualisid).val().toUpperCase() +
			'.';
		if ($('.vsince.' + aktualisid).val() != '') {
			var vsince = ' (Since ' + $('.vsince.' + aktualisid).val() + '.) ';
		} else {
			var vsince = '';
		}
		if ($('.vbrand.' + aktualisid).val() != '') {
			var vbrand = 'The brand of the vehicle is ' + $('.vbrand.' + aktualisid).val() + '. ';
		} else {
			var vbrand = '';
		}
		var kocsi = valap + vsince + vbrand + $('.pfree.' + aktualisid).val();
		if (tomb[aktfoszam].vehic === undefined) {
			tomb[aktfoszam].vehic = [];
		}
		tarolo = 0;
		tomb[aktfoszam].vehic.forEach(function(i, index) {
			if (i.kapcs === aktualisid) {
				tomb[aktfoszam].vehic[index] = {
					tart: kocsi,
					kapcs: aktualisid,
					bevez: 'This individual is related to the(se) vehicle(s): '
				};
				tarolo = 1;
			}
		});
		if (tarolo === 0) {
			tomb[aktfoszam].vehic.push({
				tart: kocsi,
				kapcs: aktualisid,
				bevez: 'This individual is related to the(se) vehicle(s): '
			});
		}
		szoveg(tomb);
	});
	sajatalszamszamkent = sajatalszamszamkent + 1;
	techsajatalszamszamkent = sajatalszamszamkent - 1;
	if ($('#szj' + sajatfoszamszamkent + '_' + (sajatalszamszamkent - 1)).nextAll().eq(2)[0] === undefined) {
		$('#form' + sajatfoszamszamkent + '_' + techsajatalszamszamkent).after(
			'<select id="szj' +
				sajatfoszamszamkent +
				'_' +
				sajatalszamszamkent +
				'"class="custom-select mt-2 col-3 szemelyjellemzo mt-2 mb-2"><option value="valasztas">Add new feature</option><option value="perspart">Personal particulars</option><option value="conviction">Conviction</option><option value="ongoing">Ongoing procedure</option><option value="questioning">Questioned by the police</option><option value="control">Controlled by the police</option><option value="border">Border crossing</option><option value="case">Criminal case</option><option value="phone">Phone number</option><option value="documents">Document</option><option value="address">Address</option><option value="company">Company</option><option value="vehicle">Vehicle</option><option value="alias">Alias</option><option value="wanted">Wanted</option><option value="free">Free text</option></select>'
		);
	}
}

function alias() {
	$('#' + sajatid).after(
		'<form class="" onsubmit="return false" id="form' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'"><div class="form-row"><input class="form-control mand col div mb-2 mr-sm-2 palias e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" placeholder="alias (mandatory)"></div><div class="form-row"><input class="form-control col div mb-2 mr-sm-2 pfree e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" placeholder="free text"><button type="button" id="b' +
			aktfoszam +
			'" onclick="featuretorles(this)" class="btn mr-2 btn-sm btn-outline-danger mb-2" data-toggle="tooltip" data-placement="top" title="Remove this feature">-</button><button type="submit" class="gomb btn btn-primary mb-2" id="e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'">Add</button><br></div></form>'
	);
	$('#e' + sajatfoszamszamkent + '_' + sajatalszamszamkent).on('click', function(prop) {
		prop.stopPropagation();
		$(this).text('Update');
		aktualisid = $(this).attr('id');
		aktfoszam = $(this).attr('id').slice(1, $(this).attr('id').indexOf('_'));
		var alnev = $('.palias.' + aktualisid).val() + '. ' + $('.pfree.' + aktualisid).val();
		if (tomb[aktfoszam].aliases === undefined) {
			tomb[aktfoszam].aliases = [];
		}
		tarolo = 0;
		tomb[aktfoszam].aliases.forEach(function(i, index) {
			if (i.kapcs === aktualisid) {
				tomb[aktfoszam].aliases[index] = {
					tart: alnev,
					kapcs: aktualisid,
					bevez: 'The known alias(es) of this person: '
				};
				tarolo = 1;
			}
		});
		if (tarolo === 0) {
			tomb[aktfoszam].aliases.push({
				tart: alnev,
				kapcs: aktualisid,
				bevez: 'The known alias(es) of this person: '
			});
		}
		szoveg(tomb);
	});
	sajatalszamszamkent = sajatalszamszamkent + 1;
	techsajatalszamszamkent = sajatalszamszamkent - 1;
	if ($('#szj' + sajatfoszamszamkent + '_' + (sajatalszamszamkent - 1)).nextAll().eq(2)[0] === undefined) {
		$('#form' + sajatfoszamszamkent + '_' + techsajatalszamszamkent).after(
			'<select id="szj' +
				sajatfoszamszamkent +
				'_' +
				sajatalszamszamkent +
				'"class="custom-select mt-2 col-3 szemelyjellemzo mt-2 mb-2"><option value="valasztas">Add new feature</option><option value="perspart">Personal particulars</option><option value="conviction">Conviction</option><option value="ongoing">Ongoing procedure</option><option value="questioning">Questioned by the police</option><option value="control">Controlled by the police</option><option value="border">Border crossing</option><option value="case">Criminal case</option><option value="phone">Phone number</option><option value="documents">Document</option><option value="address">Address</option><option value="company">Company</option><option value="vehicle">Vehicle</option><option value="alias">Alias</option><option value="wanted">Wanted</option><option value="free">Free text</option></select>'
		);
	}
}

function wanted() {
	$('#' + sajatid).after(
		'<form class="" onsubmit="return false" id="form' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'"><div class="form-row"><select class="custom-select mand mb-2 mr-2 col-4 warrtip e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'"><option value="type (mandatory)">type (mandatory)</option><option value="national arrest warrant">national arrest warrant</option><option value="European Arrest Warrant">European Arrest Warrant</option><option value="International Arrest Warrant">International Arrest Warrant</option></select><div class="form-check form-check-inline"><input type="checkbox" class="form-check-input bymy e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" id="bymy e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'"><label class="form-check-label" for="bymy e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'">By my country</label></div><input class="form-control mand col div mb-2 mr-sm-2 wcrime e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" placeholder="crime (mandatory)"></div><div class="form-row"><input class="form-control col div mb-2 mr-sm-2 warrdate e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" placeholder="arrest warrant issued on"><input class="form-control col div mb-2 mr-sm-2 warrby e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" placeholder="arrest warrant issued by"><input class="form-control col div mb-2 mr-sm-2 refwarr e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" placeholder="reference number of the arrest warrant"><div class="form-check form-check-inline"><input type="checkbox" class="form-check-input pleasearrest e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" id="pleasearrest e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'"><label class="form-check-label" for="pleasearrest e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'">Please arrest</label></div></div><div class="form-row"><input class="form-control col div mb-2 mr-sm-2 free e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" placeholder="free text"><button type="button" id="b' +
			aktfoszam +
			'" onclick="featuretorles(this)" class="btn mr-2 btn-sm btn-outline-danger mb-2" data-toggle="tooltip" data-placement="top" title="Remove this feature">-</button><button type="submit" class="gomb btn btn-primary mb-2" id="e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'">Add</button><br></div></form>'
	);
	$('#e' + sajatfoszamszamkent + '_' + sajatalszamszamkent).on('click', function(prop) {
		prop.stopPropagation();
		$(this).text('Update');
		aktualisid = $(this).attr('id');
		aktfoszam = $(this).attr('id').slice(1, $(this).attr('id').indexOf('_'));
		nembeloves();
		var wantedalap = 'A valid ' + $('.warrtip.' + aktualisid).val() + ' was issued against this person ';
		if ($('.bymy.' + aktualisid)[0].checked === true) {
			var bymy = 'by my country ';
		} else {
			var bymy = '';
		}
		var wantedbcs = 'as a suspect / perpetrator of the crime: ' + $('.wcrime.' + aktualisid).val() + '.';
		if ($('.warrdate.' + aktualisid).val() != '') {
			var warrdate = ' The arrest warrant was issued on ' + $('.warrdate.' + aktualisid).val() + '.';
		} else {
			var warrdate = '';
		}
		if ($('.warrby.' + aktualisid).val() != '') {
			var warrby = ' The warrant was issued by ' + $('.warrby.' + aktualisid).val() + '.';
		} else {
			var warrby = '';
		}
		if ($('.refwarr.' + aktualisid).val() != '') {
			var refwarr = ' The reference number of the warrant is: ' + $('.refwarr.' + aktualisid).val() + '.';
		} else {
			var refwarr = '';
		}
		if ($('.pleasearrest.' + aktualisid)[0].checked === true) {
			var pleasearrest =
				' Please take all the possible measures in order to arrest the wanted person. Also, please inform us about any of ' +
				birtokosneme +
				' (newly revealed) availabilities. ';
		} else {
			var pleasearrest = '';
		}
		var wantedsz =
			wantedalap + bymy + wantedbcs + warrdate + warrby + refwarr + pleasearrest + $('.free.' + aktualisid).val();
		if (tomb[aktfoszam].korozott === undefined) {
			tomb[aktfoszam].korozott = [];
		}
		tarolo = 0;
		tomb[aktfoszam].korozott.forEach(function(i, index) {
			if (i.kapcs === aktualisid) {
				tomb[aktfoszam].korozott[index] = {
					tart: wantedsz,
					kapcs: aktualisid,
					bevez: 'The following arrest warrant(s) were issued against this individual: '
				};
				tarolo = 1;
			}
		});
		if (tarolo === 0) {
			tomb[aktfoszam].korozott.push({
				tart: wantedsz,
				kapcs: aktualisid,
				bevez: 'The following arrest warrant(s) were issued against this individual: '
			});
		}
		szoveg(tomb);
	});
	sajatalszamszamkent = sajatalszamszamkent + 1;
	techsajatalszamszamkent = sajatalszamszamkent - 1;
	if ($('#szj' + sajatfoszamszamkent + '_' + (sajatalszamszamkent - 1)).nextAll().eq(2)[0] === undefined) {
		$('#form' + sajatfoszamszamkent + '_' + techsajatalszamszamkent).after(
			'<select id="szj' +
				sajatfoszamszamkent +
				'_' +
				sajatalszamszamkent +
				'"class="custom-select mt-2 col-3 szemelyjellemzo mt-2 mb-2"><option value="valasztas">Add new feature</option><option value="perspart">Personal particulars</option><option value="conviction">Conviction</option><option value="ongoing">Ongoing procedure</option><option value="questioning">Questioned by the police</option><option value="control">Controlled by the police</option><option value="border">Border crossing</option><option value="case">Criminal case</option><option value="phone">Phone number</option><option value="documents">Document</option><option value="address">Address</option><option value="company">Company</option><option value="vehicle">Vehicle</option><option value="alias">Alias</option><option value="wanted">Wanted</option><option value="free">Free text</option></select>'
		);
	}
}

function free() {
	$('#' + sajatid).after(
		'<form class="form-inline" onsubmit="return false" id="form' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'"><textarea class="form-control col div mb-2 mr-sm-2 pfree e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" placeholder="free text" rows="5"></textarea><button type="button" id="b' +
			aktfoszam +
			'" onclick="featuretorles(this)" class="btn mr-2 btn-outline-danger mb-2" data-toggle="tooltip" data-placement="top" title="Remove this feature">-</button><button type="submit" class="gomb btn btn-primary mb-2" id="e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'">Add</button><br></form>'
	);
	$('#e' + sajatfoszamszamkent + '_' + sajatalszamszamkent).on('click', function(prop) {
		prop.stopPropagation();
		$(this).text('Update');
		aktualisid = $(this).attr('id');
		aktfoszam = $(this).attr('id').slice(1, $(this).attr('id').indexOf('_'));
		var szabad = $('.pfree.' + aktualisid).val();
		if (tomb[aktfoszam].szszoveg === undefined) {
			tomb[aktfoszam].szszoveg = [];
		}
		tarolo = 0;
		tomb[aktfoszam].szszoveg.forEach(function(i, index) {
			if (i.kapcs === aktualisid) {
				tomb[aktfoszam].szszoveg[index] = { tart: szabad, kapcs: aktualisid, bevez: '' };
				tarolo = 1;
			}
		});
		if (tarolo === 0) {
			tomb[aktfoszam].szszoveg.push({ tart: szabad, kapcs: aktualisid, bevez: '' });
		}
		szoveg(tomb);
	});
	sajatalszamszamkent = sajatalszamszamkent + 1;
	techsajatalszamszamkent = sajatalszamszamkent - 1;
	if ($('#szj' + sajatfoszamszamkent + '_' + (sajatalszamszamkent - 1)).nextAll().eq(2)[0] === undefined) {
		$('#form' + sajatfoszamszamkent + '_' + techsajatalszamszamkent).after(
			'<select id="szj' +
				sajatfoszamszamkent +
				'_' +
				sajatalszamszamkent +
				'"class="custom-select mt-2 col-3 szemelyjellemzo mt-2 mb-2"><option value="valasztas">Add new feature</option><option value="perspart">Personal particulars</option><option value="conviction">Conviction</option><option value="ongoing">Ongoing procedure</option><option value="questioning">Questioned by the police</option><option value="control">Controlled by the police</option><option value="border">Border crossing</option><option value="case">Criminal case</option><option value="phone">Phone number</option><option value="documents">Document</option><option value="address">Address</option><option value="company">Company</option><option value="vehicle">Vehicle</option><option value="alias">Alias</option><option value="wanted">Wanted</option><option value="free">Free text</option></select>'
		);
	}
}

function subscriber() {
	$('#' + sajatid).after(
		'<form class="" onsubmit="return false" id="form' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'"><div class="form-row"><input class="form-control col-1 div mb-2 mr-sm-2 tsource e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" placeholder="provider"><input class="form-control mand col-2 div mb-2 mr-sm-2 rugvez e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" placeholder="family name"><input class="form-control mand col-2 div mb-2 mr-sm-2 rugker e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" placeholder="given name"><input class="form-control col div mb-2 mr-sm-2 rugyear e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" placeholder="year of birth"><input class="form-control col div mb-2 mr-sm-2 rugmonth e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" placeholder="month of birth"><input class="form-control col div mb-2 mr-sm-2 rugday e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" placeholder="day of birth"><input class="form-control col-2 div mb-2 mr-sm-2 rugother e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" placeholder="other pers. data"><button type="button" id="b' +
			aktfoszam +
			'" onclick="koztesvegere(this)" class="ujsorbaszemely btn mr-2 btn-sm btn-info mb-2" data-toggle="tooltip" data-placement="top" title="Add this person as a new main object">@</button></div></div><div class="form-check form-check-inline"><input type="checkbox" id="noconv e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" class="form-check-input noconv e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'"><label class ="form-check-label" for="noconv e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'">No convictions of the subscriber</label></div><div class="form-check form-check-inline"><input type="checkbox" id="noongoh e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" class="form-check-input noongo e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'"><label  class="form-check-label" for="noongo e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'">Subscriber is not a suspect</label></div><div class="form-check form-check-inline"><input type="checkbox" id="nofiles e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" class="form-check-input nofiles e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'"><label class ="form-check-label" for="nofiles e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'">Subscriber has no rel. files</label></div></div><div class="form-row"><input class="form-control col div mb-2 mr-sm-2 pfree e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" placeholder="free text"><button type="button" id="b' +
			aktfoszam +
			'" onclick="featuretorles(this)" class="btn mr-2 btn-sm btn-outline-danger mb-2" data-toggle="tooltip" data-placement="top" title="Remove this feature">-</button><button type="submit" class="gomb btn btn-primary mb-2" id="e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'">Add</button><br></form>'
	);
	$('#e' + sajatfoszamszamkent + '_' + sajatalszamszamkent).on('click', function(prop) {
		prop.stopPropagation();
		$(this).text('Update');
		aktualisid = $(this).attr('id');
		aktfoszam = $(this).attr('id').slice(1, $(this).attr('id').indexOf('_'));
		var elofizeto = szemelygen();
		var tszemely = elofizeto + ' is the subscriber of the phone number';
		if ($('.tsource.' + aktualisid).val() != '') {
			var tsource = 'According to the answer of the provider ' + $('.tsource.' + aktualisid).val() + ', ';
		} else {
			var tsource = '';
		}
		if ($('.noongo.' + aktualisid)[0].checked === true) {
			var noongo = ' This individual is not a suspect in any ongoing criminal investigations. ';
		} else {
			var noongo = '';
		}
		if ($('.noconv.' + aktualisid)[0].checked === true) {
			var noconv = ' The subscriber has no convictions. ';
		} else {
			var noconv = '';
		}
		if ($('.nofiles.' + aktualisid)[0].checked === true) {
			var nofiles = ' This person has no relevant police files. ';
		} else {
			var nofiles = '';
		}
		var subsc = tsource + tszemely + '. ' + $('.pfree.' + aktualisid).val() + noconv + noongo + nofiles;
		if (tomb[aktfoszam].elofiz === undefined) {
			tomb[aktfoszam].elofiz = [];
		}
		tarolo = 0;
		tomb[aktfoszam].elofiz.forEach(function(i, index) {
			if (i.kapcs === aktualisid) {
				tomb[aktfoszam].elofiz[index] = { tart: subsc, kapcs: aktualisid, bevez: '' };
				tarolo = 1;
			}
		});
		if (tarolo === 0) {
			tomb[aktfoszam].elofiz.push({ tart: subsc, kapcs: aktualisid, bevez: '' });
		}
		szoveg(tomb);
	});
	sajatalszamszamkent = sajatalszamszamkent + 1;
	techsajatalszamszamkent = sajatalszamszamkent - 1;
	if ($('#szj' + sajatfoszamszamkent + '_' + (sajatalszamszamkent - 1)).nextAll().eq(2)[0] === undefined) {
		$('#form' + sajatfoszamszamkent + '_' + techsajatalszamszamkent).after(
			'<select id="szj' +
				sajatfoszamszamkent +
				'_' +
				sajatalszamszamkent +
				'"class="custom-select mt-2 col-3 telojellemzo mt-2 mb-2"><option value="valasztas">Add new feature</option><option value="subscriber">Subscriber</option><option value="user">User</option><option value="free">Free text</option></select>'
		);
	}
}

function user() {
	$('#' + sajatid).after(
		'<form class="" onsubmit="return false" id="form' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'"><div class="form-row"><input class="form-control col-1 div mb-2 mr-sm-2 tsource e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" placeholder="source"><input class="form-control mand col-2 div mb-2 mr-sm-2 rugvez e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" placeholder="family name"><input class="form-control mand col-2 div mb-2 mr-sm-2 rugker e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" placeholder="given name"><input class="form-control col div mb-2 mr-sm-2 rugyear e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" placeholder="year of birth"><input class="form-control col div mb-2 mr-sm-2 rugmonth e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" placeholder="month of birth"><input class="form-control col div mb-2 mr-sm-2 rugday e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" placeholder="day of birth"><input class="form-control col-2 div mb-2 mr-sm-2 rugother e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" placeholder="other pers. data"><button type="button" id="b' +
			aktfoszam +
			'" onclick="koztesvegere(this)" class="ujsorbaszemely btn mr-2 btn-sm btn-info mb-2" data-toggle="tooltip" data-placement="top" title="Add this person as a new main object">@</button></div></div><div class="form-check form-check-inline"><input type="checkbox" id="noconv e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" class="form-check-input noconv e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'"><label for="noconv e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" class ="form-check-label">No convictions of the user</label></div><div class="form-check form-check-inline"><input type="checkbox" id="noongo e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" class="form-check-input noongo e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'"><label for="noongo e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" class ="form-check-label">User is not a suspect</label><div class="form-check form-check-inline"></div><input type="checkbox" id="nofiles e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" class="form-check-input nofiles e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'"><label for="nofiles e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" class ="form-check-label">User has no rel. files</label></div><div class="form-row"><input class="form-control col div mb-2 mr-sm-2 pfree e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" placeholder="free text"><button type="button" id="b' +
			aktfoszam +
			'" onclick="featuretorles(this)" class="btn mr-2 btn-sm btn-outline-danger mb-2" data-toggle="tooltip" data-placement="top" title="Remove this feature">-</button><button type="submit" class="gomb btn btn-primary mb-2" id="e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'">Add</button><br></form>'
	);
	$('#e' + sajatfoszamszamkent + '_' + sajatalszamszamkent).on('click', function(prop) {
		prop.stopPropagation();
		$(this).text('Update');
		aktualisid = $(this).attr('id');
		aktfoszam = $(this).attr('id').slice(1, $(this).attr('id').indexOf('_'));
		var hasznalo = szemelygen();
		var tszemely = hasznalo + ' is the user of the phone number';
		if ($('.tsource.' + aktualisid).val() != '') {
			var tsource = 'According to ' + $('.tsource.' + aktualisid).val() + ', ';
		} else {
			var tsource = '';
		}
		if ($('.noongo.' + aktualisid)[0].checked === true) {
			var noongo = ' This individual is not a suspect in any ongoing criminal investigations. ';
		} else {
			var noongo = '';
		}
		if ($('.noconv.' + aktualisid)[0].checked === true) {
			var noconv = ' The user has no convictions. ';
		} else {
			var noconv = '';
		}
		if ($('.nofiles.' + aktualisid)[0].checked === true) {
			var nofiles = ' This person has no relevant police files. ';
		} else {
			var nofiles = '';
		}
		var user = tsource + tszemely + '. ' + $('.pfree.' + aktualisid).val() + noconv + noongo + nofiles;
		if (tomb[aktfoszam].haszn === undefined) {
			tomb[aktfoszam].haszn = [];
		}
		tarolo = 0;
		tomb[aktfoszam].haszn.forEach(function(i, index) {
			if (i.kapcs === aktualisid) {
				tomb[aktfoszam].haszn[index] = { tart: user, kapcs: aktualisid, bevez: '' };
				tarolo = 1;
			}
		});
		if (tarolo === 0) {
			tomb[aktfoszam].haszn.push({ tart: user, kapcs: aktualisid, bevez: '' });
		}
		szoveg(tomb);
	});
	sajatalszamszamkent = sajatalszamszamkent + 1;
	techsajatalszamszamkent = sajatalszamszamkent - 1;
	if ($('#szj' + sajatfoszamszamkent + '_' + (sajatalszamszamkent - 1)).nextAll().eq(2)[0] === undefined) {
		$('#form' + sajatfoszamszamkent + '_' + techsajatalszamszamkent).after(
			'<select id="szj' +
				sajatfoszamszamkent +
				'_' +
				sajatalszamszamkent +
				'"class="custom-select mt-2 col-3 telojellemzo mt-2 mb-2"><option value="valasztas">Add new feature</option><option value="subscriber">Subscriber</option><option value="user">User</option><option value="free">Free text</option></select>'
		);
	}
}

function telfree() {
	$('#' + sajatid).after(
		'<form class="form-inline" onsubmit="return false" id="form' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'"><textarea class="form-control col div mb-2 mr-sm-2 pfree e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" rows="5" placeholder="free text"></textarea><button type="button" id="b' +
			aktfoszam +
			'" onclick="featuretorles(this)" class="btn mr-2 btn-outline-danger mb-2" data-toggle="tooltip" data-placement="top" title="Remove this feature">-</button><button type="submit" class="gomb btn btn-primary mb-2" id="e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'">Add</button><br></form>'
	);
	$('#e' + sajatfoszamszamkent + '_' + sajatalszamszamkent).on('click', function(prop) {
		prop.stopPropagation();
		$(this).text('Update');
		aktualisid = $(this).attr('id');
		aktfoszam = $(this).attr('id').slice(1, $(this).attr('id').indexOf('_'));
		var szabad = $('.pfree.' + aktualisid).val();
		if (tomb[aktfoszam].szszoveg === undefined) {
			tomb[aktfoszam].szszoveg = [];
		}
		tarolo = 0;
		tomb[aktfoszam].szszoveg.forEach(function(i, index) {
			if (i.kapcs === aktualisid) {
				tomb[aktfoszam].szszoveg[index] = { tart: szabad, kapcs: aktualisid, bevez: '' };
				tarolo = 1;
			}
		});
		if (tarolo === 0) {
			tomb[aktfoszam].szszoveg.push({ tart: szabad, kapcs: aktualisid, bevez: '' });
		}
		szoveg(tomb);
	});
	sajatalszamszamkent = sajatalszamszamkent + 1;
	techsajatalszamszamkent = sajatalszamszamkent - 1;
	if ($('#szj' + sajatfoszamszamkent + '_' + (sajatalszamszamkent - 1)).nextAll().eq(2)[0] === undefined) {
		$('#form' + sajatfoszamszamkent + '_' + techsajatalszamszamkent).after(
			'<select id="szj' +
				sajatfoszamszamkent +
				'_' +
				sajatalszamszamkent +
				'"class="custom-select mt-2 col-3 telojellemzo mt-2 mb-2"><option value="valasztas">Add new feature</option><option value="subscriber">Subscriber</option><option value="user">User</option><option value="free">Free text</option></select>'
		);
	}
}

function bankincase() {
	$('#' + sajatid).after(
		'<form class="" onsubmit="return false" id="form' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'"><div class="form-row"><input class="form-control mand col div mb-2 mr-sm-2 bunit e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" placeholder="police unit (mandatory)"><input class="form-control mand col div mb-2 mr-sm-2 bcrime e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" placeholder="crime (mandatory)"><input class="form-control col div mb-2 mr-sm-2 bcasenr e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" placeholder="case number"><input class="form-control col div mb-2 mr-sm-2 byear e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" placeholder="year of investigation"><div class="form-check form-check-inline"><input type="checkbox" id="bforw e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" class="form-check-input bforw e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'"><label for="bforw e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" class="form-check-label">Request forwarded</label></div></div><div class="form-row"><input class="form-control col div mb-2 mr-sm-2 free e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" placeholder="free text"><button type="button" id="b' +
			aktfoszam +
			'" onclick="featuretorles(this)" class="btn mr-2 btn-sm btn-outline-danger mb-2" data-toggle="tooltip" data-placement="top" title="Remove this feature">-</button><button type="submit" class="gomb btn btn-primary mb-2" id="e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'">Add</button><br></div></form>'
	);
	$('#e' + sajatfoszamszamkent + '_' + sajatalszamszamkent).on('click', function(prop) {
		prop.stopPropagation();
		$(this).text('Update');
		aktualisid = $(this).attr('id');
		aktfoszam = $(this).attr('id').slice(1, $(this).attr('id').indexOf('_'));
		var bincase =
			'Competent police unit: ' +
			$('.bunit.' + aktualisid).val() +
			', conducted upon the suspicion of ' +
			$('.bcrime.' + aktualisid).val() +
			'. ';
		if ($('.bcasenr.' + aktualisid).val() != '') {
			var bcasenr = ' (Case nr. ' + $('.bcasenr.' + aktualisid).val() + '.) ';
		} else {
			var bcasenr = '';
		}
		if ($('.byear.' + aktualisid).val() != '') {
			var byear = 'The investigation was commenced in ' + $('.byear.' + aktualisid).val() + '. ';
		} else {
			var byear = '';
		}
		if ($('.bforw.' + aktualisid)[0].checked === true) {
			var bforw =
				"We've forwarded your request to the competent police unit in order to evaluate it and to facilitate further information exchange. ";
		} else {
			var bforw = '';
		}
		var bankugy = bincase + bcasenr + byear + bforw + $('.free.' + aktualisid).val();
		if (tomb[aktfoszam].bankszamlaugyben === undefined) {
			tomb[aktfoszam].bankszamlaugyben = [];
		}
		tarolo = 0;
		tomb[aktfoszam].bankszamlaugyben.forEach(function(i, index) {
			if (i.kapcs === aktualisid) {
				tomb[aktfoszam].bankszamlaugyben[index] = {
					tart: bankugy,
					kapcs: aktualisid,
					bevez: 'This bank account number emerged in the following criminal case(s): '
				};
				tarolo = 1;
			}
		});
		if (tarolo === 0) {
			tomb[aktfoszam].bankszamlaugyben.push({
				tart: bankugy,
				kapcs: aktualisid,
				bevez: 'This bank account number emerged in the following criminal case(s): '
			});
		}
		szoveg(tomb);
	});
	sajatalszamszamkent = sajatalszamszamkent + 1;
	techsajatalszamszamkent = sajatalszamszamkent - 1;
	if ($('#szj' + sajatfoszamszamkent + '_' + (sajatalszamszamkent - 1)).nextAll().eq(2)[0] === undefined) {
		$('#form' + sajatfoszamszamkent + '_' + techsajatalszamszamkent).after(
			'<select id="szj' +
				sajatfoszamszamkent +
				'_' +
				sajatalszamszamkent +
				'"class="custom-select mt-2 col-3 bankszjellemzo mt-2 mb-2"><option value="valasztas">Add new feature</option><option value="incase">In case</option><option value="owner">Owner</option><option value="free">Free text</option></select>'
		);
	}
}

function owner() {
	$('#' + sajatid).after(
		'<form class="" onsubmit="return false" id="form' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'"><div class="form-check form-check-inline"><input type="checkbox" id="bconf e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" class="form-check-input bconf e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'"><label class="form-check-label" for="bconf e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'">We can confirm</label></div><div class="form-check form-check-inline"><input type="checkbox" id="benclosed e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" class="form-check-input benclosed e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'"><label class ="form-check-label" for="benclosed e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'">Certificate enclosed</label></div><div class="form-row"><input class="form-control mand col-2 div mb-2 mr-sm-2 rugvez e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" placeholder="company / family name"><input class="form-control col-2 div mb-2 mr-sm-2 rugker e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" placeholder="given name"><input class="form-control col div mb-2 mr-sm-2 rugyear e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" placeholder="year of birth"><input class="form-control col div mb-2 mr-sm-2 rugmonth e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" placeholder="month of birth"><input class="form-control col div mb-2 mr-sm-2 rugday e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" placeholder="day of birth"><input class="form-control col-3 div mb-2 mr-sm-2 rugother e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" placeholder="other pers. data"><button type="button" id="b' +
			aktfoszam +
			'" onclick="koztesvegere(this)" class="ujsorbaszemely btn mr-2 btn-sm btn-info mb-2" data-toggle="tooltip" data-placement="top" title="Add this person as a new main object">@</button></div><div class="form-row"><input class="form-control col div mb-2 mr-sm-2 free e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" placeholder="free text"><button type="button" id="b' +
			aktfoszam +
			'" onclick="featuretorles(this)" class="btn mr-2 btn-sm btn-outline-danger mb-2" data-toggle="tooltip" data-placement="top" title="Remove this feature">-</button><button type="submit" class="gomb btn btn-primary mb-2" id="e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'">Add</button></div></form>'
	);
	$('#e' + sajatfoszamszamkent + '_' + sajatalszamszamkent).on('click', function(prop) {
		prop.stopPropagation();
		$(this).text('Update');
		aktualisid = $(this).attr('id');
		aktfoszam = $(this).attr('id').slice(1, $(this).attr('id').indexOf('_'));
		var egyebszem = szemelygen();
		var bowned = 'This bank account is owned by ' + egyebszem + '. ';
		if ($('.bconf.' + aktualisid)[0].checked === true) {
			var bconf = 'We can confirm: ';
		} else {
			var bconf = '';
		}
		if ($('.benclosed.' + aktualisid)[0].checked === true) {
			var benclosed =
				'Please find the company certificate - containing all the available data, such as the personal particulars of the owner(s) - attached in English. ';
		} else {
			var benclosed = '';
		}
		var banksztulaj = bconf + bowned + benclosed + $('.free.' + aktualisid).val();
		if (tomb[aktfoszam].bankszamlatulaj === undefined) {
			tomb[aktfoszam].bankszamlatulaj = [];
		}
		tarolo = 0;
		tomb[aktfoszam].bankszamlatulaj.forEach(function(i, index) {
			if (i.kapcs === aktualisid) {
				tomb[aktfoszam].bankszamlatulaj[index] = { tart: banksztulaj, kapcs: aktualisid, bevez: '' };
				tarolo = 1;
			}
		});
		if (tarolo === 0) {
			tomb[aktfoszam].bankszamlatulaj.push({ tart: banksztulaj, kapcs: aktualisid, bevez: '' });
		}
		szoveg(tomb);
	});
	sajatalszamszamkent = sajatalszamszamkent + 1;
	techsajatalszamszamkent = sajatalszamszamkent - 1;
	if ($('#szj' + sajatfoszamszamkent + '_' + (sajatalszamszamkent - 1)).nextAll().eq(2)[0] === undefined) {
		$('#form' + sajatfoszamszamkent + '_' + techsajatalszamszamkent).after(
			'<select id="szj' +
				sajatfoszamszamkent +
				'_' +
				sajatalszamszamkent +
				'"class="custom-select mt-2 col-3 bankszjellemzo mt-2 mb-2"><option value="valasztas">Add new feature</option><option value="incase">In case</option><option value="owner">Owner</option><option value="free">Free text</option></select>'
		);
	}
}

function bankfree() {
	$('#' + sajatid).after(
		'<form class="form-inline" onsubmit="return false" id="form' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'"><textarea class="form-control col div mb-2 mr-sm-2 free e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" rows="5" placeholder="free text"></textarea><button type="button" id="b' +
			aktfoszam +
			'" onclick="featuretorles(this)" class="btn mr-2 btn-outline-danger mb-2" data-toggle="tooltip" data-placement="top" title="Remove this feature">-</button><button type="submit" class="gomb btn btn-primary mb-2" id="e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'">Add</button><br></form>'
	);
	$('#e' + sajatfoszamszamkent + '_' + sajatalszamszamkent).on('click', function(prop) {
		prop.stopPropagation();
		$(this).text('Update');
		aktualisid = $(this).attr('id');
		aktfoszam = $(this).attr('id').slice(1, $(this).attr('id').indexOf('_'));
		var bfreetext = $('.free.' + aktualisid).val();
		if (tomb[aktfoszam].bankszszabad === undefined) {
			tomb[aktfoszam].bankszszabad = [];
		}
		tarolo = 0;
		tomb[aktfoszam].bankszszabad.forEach(function(i, index) {
			if (i.kapcs === aktualisid) {
				tomb[aktfoszam].bankszszabad[index] = { tart: bfreetext, kapcs: aktualisid, bevez: '' };
				tarolo = 1;
			}
		});
		if (tarolo === 0) {
			tomb[aktfoszam].bankszszabad.push({ tart: bfreetext, kapcs: aktualisid, bevez: '' });
		}
		szoveg(tomb);
	});
	sajatalszamszamkent = sajatalszamszamkent + 1;
	techsajatalszamszamkent = sajatalszamszamkent - 1;
	if ($('#szj' + sajatfoszamszamkent + '_' + (sajatalszamszamkent - 1)).nextAll().eq(2)[0] === undefined) {
		$('#form' + sajatfoszamszamkent + '_' + techsajatalszamszamkent).after(
			'<select id="szj' +
				sajatfoszamszamkent +
				'_' +
				sajatalszamszamkent +
				'"class="custom-select mt-2 col-3 bankszjellemzo mt-2 mb-2"><option value="valasztas">Add new feature</option><option value="incase">In case</option><option value="owner">Owner</option><option value="free">Free text</option></select>'
		);
	}
}

function members() {
	$('#' + sajatid).after(
		'<form class="" onsubmit="return false" id="form' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'"><div class="form-check form-check-inline"><input type="checkbox" id="nopol e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" class="form-check-input nopol e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'"><label class ="form-check-label" for="nopol e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'">No police files of the owner(s)</label></div><div class="form-check form-check-inline"><input type="checkbox" id="norepol e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" class="form-check-input norepol e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'"><label class ="form-check-label" for="id="norepol e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'">No relevant police files of the owner(s)</label></div><legend class="col-form-label mt-2 pt-0">Personal data of the executive(s)</legend><div class="form-row"><input class="form-control mand col-2 div mb-2 mr-sm-2 rugvez e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" placeholder="family name"><input class="form-control col-2 div mand mb-2 mr-sm-2 rugker e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" placeholder="given name"><input class="form-control col div mb-2 mr-sm-2 rugyear e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" placeholder="year of birth"><input class="form-control col div mb-2 mr-sm-2 rugmonth e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" placeholder="month of birth"><input class="form-control col div mb-2 mr-sm-2 rugday e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" placeholder="day of birth"><input class="form-control col-3 div mb-2 mr-sm-2 rugother e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" placeholder="other pers. data"><button type="button" id="b' +
			aktfoszam +
			'" onclick="koztesvegere(this)" class="ujsorbaszemely btn mr-2 btn-sm btn-info mb-2" data-toggle="tooltip" data-placement="top" title="Add this person as a new main object">@</button><button type="button" id="b' +
			aktfoszam +
			'" onclick="megegyszemely(this)" class="szempluszgomb btn mr-2 btn-sm btn-info mb-2" data-toggle="tooltip" data-placement="top" title="Add a new person to this feature">+</button></div><div class="form-row"><input class="form-control col div mb-2 mr-sm-2 free e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" placeholder="free text"><button type="button" id="b' +
			aktfoszam +
			'" onclick="featuretorles(this)" class="btn mr-2 btn-sm btn-outline-danger mb-2" data-toggle="tooltip" data-placement="top" title="Remove this feature">-</button><button type="submit" class="gomb btn btn-primary mb-2" id="e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'">Add</button></div></form>'
	);
	$('#e' + sajatfoszamszamkent + '_' + sajatalszamszamkent).on('click', function(prop) {
		prop.stopPropagation();
		$(this).text('Update');
		aktualisid = $(this).attr('id');
		aktfoszam = $(this).attr('id').slice(1, $(this).attr('id').indexOf('_'));
		var tag = szemelygen();
		if ($('.nopol.' + aktualisid)[0].checked === true) {
			var nopol = ' The executive(s) have no police files. ';
		} else {
			var nopol = '';
		}
		if ($('.norepol.' + aktualisid)[0].checked === true) {
			var norepol = ' The executive(s) have no relevant police files. ';
		} else {
			var norepol = '';
		}
		var comptag = tag + '. ' + nopol + norepol + $('.free.' + aktualisid).val();
		if (tomb[aktfoszam].cegtag === undefined) {
			tomb[aktfoszam].cegtag = [];
		}
		tarolo = 0;
		tomb[aktfoszam].cegtag.forEach(function(i, index) {
			if (i.kapcs === aktualisid) {
				tomb[aktfoszam].cegtag[index] = {
					tart: comptag,
					kapcs: aktualisid,
					bevez: 'The registered member(s) (executive officers) of the company: '
				};
				tarolo = 1;
			}
		});
		if (tarolo === 0) {
			tomb[aktfoszam].cegtag.push({
				tart: comptag,
				kapcs: aktualisid,
				bevez: 'The registered member(s) (executive officers) of the company: '
			});
		}
		szoveg(tomb);
	});
	sajatalszamszamkent = sajatalszamszamkent + 1;
	techsajatalszamszamkent = sajatalszamszamkent - 1;
	if ($('#szj' + sajatfoszamszamkent + '_' + (sajatalszamszamkent - 1)).nextAll().eq(2)[0] === undefined) {
		$('#form' + sajatfoszamszamkent + '_' + techsajatalszamszamkent).after(
			'<select id="szj' +
				sajatfoszamszamkent +
				'_' +
				sajatalszamszamkent +
				'"class="custom-select mt-2 col-3 cegjellemzo mt-2 mb-2"><option value="valasztas">Add new feature</option><option value="members">Members</option><option value="bankacc">Bank accounts</option><option value="incase">In case</option><option value="free">Free text</option></select>'
		);
	}
}

function cegszamla() {
	$('#' + sajatid).after(
		'<form class="" onsubmit="return false" id="form' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'"><div class="form-row"><input class="form-control mand col div mb-2 mr-sm-2 cegacc e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" placeholder="bank account(s) (mandatory)"><input class="form-control col-7 div mb-2 mr-sm-2 free e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" placeholder="free text"><button type="button" id="b' +
			aktfoszam +
			'" onclick="featuretorles(this)" class="btn mr-2 btn-sm btn-outline-danger mb-2" data-toggle="tooltip" data-placement="top" title="Remove this feature">-</button><button type="submit" class="gomb btn btn-primary mb-2" id="e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'">Add</button><br></div></form>'
	);
	$('#e' + sajatfoszamszamkent + '_' + sajatalszamszamkent).on('click', function(prop) {
		prop.stopPropagation();
		$(this).text('Update');
		aktualisid = $(this).attr('id');
		aktfoszam = $(this).attr('id').slice(1, $(this).attr('id').indexOf('_'));
		var cegszla = $('.cegacc.' + aktualisid).val() + '. ' + $('.free.' + aktualisid).val();
		if (tomb[aktfoszam].cegbank === undefined) {
			tomb[aktfoszam].cegbank = [];
		}
		tarolo = 0;
		tomb[aktfoszam].cegbank.forEach(function(i, index) {
			if (i.kapcs === aktualisid) {
				tomb[aktfoszam].cegbank[index] = {
					tart: cegszla,
					kapcs: aktualisid,
					bevez: 'The registered bank acocunt number(s) of the company: '
				};
				tarolo = 1;
			}
		});
		if (tarolo === 0) {
			tomb[aktfoszam].cegbank.push({
				tart: cegszla,
				kapcs: aktualisid,
				bevez: 'The registered bank acocunt number(s) of the company: '
			});
		}
		szoveg(tomb);
	});
	sajatalszamszamkent = sajatalszamszamkent + 1;
	techsajatalszamszamkent = sajatalszamszamkent - 1;
	if ($('#szj' + sajatfoszamszamkent + '_' + (sajatalszamszamkent - 1)).nextAll().eq(2)[0] === undefined) {
		$('#form' + sajatfoszamszamkent + '_' + techsajatalszamszamkent).after(
			'<select id="szj' +
				sajatfoszamszamkent +
				'_' +
				sajatalszamszamkent +
				'"class="custom-select mt-2 col-3 cegjellemzo mt-2 mb-2"><option value="valasztas">Add new feature</option><option value="members">Members</option><option value="bankacc">Bank accounts</option><option value="incase">In case </option><option value="free">Free text</option></select>'
		);
	}
}

function compincase() {
	$('#' + sajatid).after(
		'<form class="" onsubmit="return false" id="form' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'"><div class="form-row"><input class="form-control mand col div mb-2 mr-sm-2 bunit e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" placeholder="police unit (mandatory)"><input class="form-control mand col div mb-2 mr-sm-2 bcrime e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" placeholder="crime (mandatory)"><input class="form-control col div mb-2 mr-sm-2 bcasenr e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" placeholder="case number"><input class="form-control col div mb-2 mr-sm-2 byear e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" placeholder="year of investigation"><div class="form-check form-check-inline"><input type="checkbox" id="bfowr e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" class="form-check-input bforw e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'"><label class ="form-check-label" for="bforw e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'">Request forwarded</label></div></div><div class="form-row"><input class="form-control col div mb-2 mr-sm-2 free e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" placeholder="free text"><button type="button" id="b' +
			aktfoszam +
			'" onclick="featuretorles(this)" class="btn mr-2 btn-sm btn-outline-danger mb-2" data-toggle="tooltip" data-placement="top" title="Remove this feature">-</button><button type="submit" class="gomb btn btn-primary mb-2" id="e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'">Add</button><br></div></form>'
	);
	$('#e' + sajatfoszamszamkent + '_' + sajatalszamszamkent).on('click', function(prop) {
		prop.stopPropagation();
		$(this).text('Update');
		aktualisid = $(this).attr('id');
		aktfoszam = $(this).attr('id').slice(1, $(this).attr('id').indexOf('_'));
		var bincase =
			'Investigation carried out by ' +
			$('.bunit.' + aktualisid).val() +
			' conducted upon the suspicion of ' +
			$('.bcrime.' + aktualisid).val() +
			'. ';
		if ($('.bcasenr.' + aktualisid).val() != '') {
			var bcasenr = ' (Case nr. ' + $('.bcasenr.' + aktualisid).val() + '.) ';
		} else {
			var bcasenr = '';
		}
		if ($('.byear.' + aktualisid).val() != '') {
			var byear = 'The investigation was commenced in ' + $('.byear.' + aktualisid).val() + '. ';
		} else {
			var byear = '';
		}
		if ($('.bforw.' + aktualisid)[0].checked === true) {
			var bforw =
				"We've forwarded your request to the competent police unit in order to evaluate it and to facilitate further information exchange. ";
		} else {
			var bforw = '';
		}
		var cegugy = bincase + bcasenr + byear + bforw + $('.free.' + aktualisid).val();
		if (tomb[aktfoszam].cegugyben === undefined) {
			tomb[aktfoszam].cegugyben = [];
		}
		tarolo = 0;
		tomb[aktfoszam].cegugyben.forEach(function(i, index) {
			if (i.kapcs === aktualisid) {
				tomb[aktfoszam].cegugyben[index] = {
					tart: cegugy,
					kapcs: aktualisid,
					bevez: 'This company emerged in the criminal case(s): '
				};
				tarolo = 1;
			}
		});
		if (tarolo === 0) {
			tomb[aktfoszam].cegugyben.push({
				tart: cegugy,
				kapcs: aktualisid,
				bevez: 'This company emerged in the criminal case(s): '
			});
		}
		szoveg(tomb);
	});
	sajatalszamszamkent = sajatalszamszamkent + 1;
	techsajatalszamszamkent = sajatalszamszamkent - 1;
	if ($('#szj' + sajatfoszamszamkent + '_' + (sajatalszamszamkent - 1)).nextAll().eq(2)[0] === undefined) {
		$('#form' + sajatfoszamszamkent + '_' + techsajatalszamszamkent).after(
			'<select id="szj' +
				sajatfoszamszamkent +
				'_' +
				sajatalszamszamkent +
				'"class="custom-select mt-2 col-3 cegjellemzo mt-2 mb-2"><option value="valasztas">Add new feature</option><option value="members">Members</option><option value="bankacc">Bank accounts</option><option value="incase">In case </option><option value="free">Free text</option></select>'
		);
	}
}

function cegfree() {
	$('#' + sajatid).after(
		'<form class="form-inline" onsubmit="return false" id="form' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'"><textarea class="form-control col div mb-2 mr-sm-2 free e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" rows="5" placeholder="free text"></textarea><button type="button" id="b' +
			aktfoszam +
			'" onclick="featuretorles(this)" class="btn mr-2 btn-outline-danger mb-2" data-toggle="tooltip" data-placement="top" title="Remove this feature">-</button><button type="submit" class="gomb btn btn-primary mb-2" id="e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'">Add</button><br></form>'
	);
	$('#e' + sajatfoszamszamkent + '_' + sajatalszamszamkent).on('click', function(prop) {
		prop.stopPropagation();
		$(this).text('Update');
		aktualisid = $(this).attr('id');
		aktfoszam = $(this).attr('id').slice(1, $(this).attr('id').indexOf('_'));
		var cfreetext = $('.free.' + aktualisid).val();
		if (tomb[aktfoszam].cegszabad === undefined) {
			tomb[aktfoszam].cegszabad = [];
		}
		tarolo = 0;
		tomb[aktfoszam].cegszabad.forEach(function(i, index) {
			if (i.kapcs === aktualisid) {
				tomb[aktfoszam].cegszabad[index] = { tart: cfreetext, kapcs: aktualisid, bevez: '' };
				tarolo = 1;
			}
		});
		if (tarolo === 0) {
			tomb[aktfoszam].cegszabad.push({ tart: cfreetext, kapcs: aktualisid, bevez: '' });
		}
		szoveg(tomb);
	});
	sajatalszamszamkent = sajatalszamszamkent + 1;
	techsajatalszamszamkent = sajatalszamszamkent - 1;
	if ($('#szj' + sajatfoszamszamkent + '_' + (sajatalszamszamkent - 1)).nextAll().eq(2)[0] === undefined) {
		$('#form' + sajatfoszamszamkent + '_' + techsajatalszamszamkent).after(
			'<select id="szj' +
				sajatfoszamszamkent +
				'_' +
				sajatalszamszamkent +
				'"class="custom-select mt-2 col-3 cegjellemzo mt-2 mb-2"><option value="valasztas">Add new feature</option><option value="members">Members</option><option value="bankacc">Bank accounts</option><option value="incase">In case </option><option value="free">Free text</option></select>'
		);
	}
}

function vehborder() {
	$('#' + sajatid).after(
		'<form class="" onsubmit="return false" id="form' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'"><div class="form-row"><input class="form-control mand col div mb-2 mr-sm-2 bccountry e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" placeholder="country (mandatory)"><input class="form-control mand col div mb-2 mr-sm-2 bcplace e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" placeholder="place (mandatory)"><select class="custom-select mand mb-2 mr-2 col-2 bcdir e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'"><option value="direction">direction (mandatory)</option><option value="entered my country">entered my country</option><option value="left my country">left my country</option></select><input class="form-control col-2 div mb-2 mr-sm-2 bcdate e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" placeholder="date"></div><legend class="col-form-label pt-0">Personal data of the related persons</legend><div class="form-row"><input class="form-control col-2 div mb-2 mr-sm-2 rugvez e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" placeholder="family name"><input class="form-control col-2 div mb-2 mr-sm-2 rugker e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" placeholder="given name"><input class="form-control col div mb-2 mr-sm-2 rugyear e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" placeholder="year of birth"><input class="form-control col div mb-2 mr-sm-2 rugmonth e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" placeholder="month of birth"><input class="form-control col div mb-2 mr-sm-2 rugday e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" placeholder="day of birth"><input class="form-control col-3 div mb-2 mr-sm-2 rugother e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" placeholder="other pers. data"><button type="button" id="b' +
			aktfoszam +
			'" onclick="koztesvegere(this)" class="ujsorbaszemely btn mr-2 btn-sm btn-info mb-2" data-toggle="tooltip" data-placement="top" title="Add this person as a new main object">@</button><button type="button" id="b' +
			aktfoszam +
			'" onclick="megegyszemely(this)" class="szempluszgomb btn mr-2 btn-sm btn-info mb-2" data-toggle="tooltip" data-placement="top" title="Add a new person to this feature">+</button></div><div class="form-row"><input class="form-control col div mb-2 mr-sm-2 free e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" placeholder="free text"><button type="button" id="b' +
			aktfoszam +
			'" onclick="featuretorles(this)" class="btn mr-2 btn-sm btn-outline-danger mb-2" data-toggle="tooltip" data-placement="top" title="Remove this feature">-</button><button type="submit" class="gomb btn btn-primary mb-2" id="e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'">Add</button></div></form>'
	);
	$('#e' + sajatfoszamszamkent + '_' + sajatalszamszamkent).on('click', function(prop) {
		prop.stopPropagation();
		$(this).text('Update');
		aktualisid = $(this).attr('id');
		aktfoszam = $(this).attr('id').slice(1, $(this).attr('id').indexOf('_'));
		var cotrav = szemelygen();
		var bcalap =
			'Direction: ' +
			$('.bcdir.' + aktualisid).val() +
			', at ' +
			$('.bcplace.' + aktualisid).val() +
			' (border between my country and ' +
			$('.bccountry.' + aktualisid).val() +
			'). ';
		if ($('.bcdate.' + aktualisid).val() != '') {
			var bcdate = 'The crossing took place on ' + $('.bcdate.' + aktualisid).val() + '. ';
		} else {
			var bcdate = '';
		}
		if (cotrav != '') {
			cotrav = 'Person(s) who used the vehicle: ' + cotrav + '.';
		}
		var vehhatar = bcalap + bcdate + cotrav + ' ' + $('.free.' + aktualisid).val();
		if (tomb[aktfoszam].vehhatlepes === undefined) {
			tomb[aktfoszam].vehhatlepes = [];
		}
		tarolo = 0;
		tomb[aktfoszam].vehhatlepes.forEach(function(i, index) {
			if (i.kapcs === aktualisid) {
				tomb[aktfoszam].vehhatlepes[index] = {
					tart: vehhatar,
					kapcs: aktualisid,
					bevez: 'The registered border crossing(s) of this vehicle: '
				};
				tarolo = 1;
			}
		});
		if (tarolo === 0) {
			tomb[aktfoszam].vehhatlepes.push({
				tart: vehhatar,
				kapcs: aktualisid,
				bevez: 'The registered border crossing(s) of this vehicle: '
			});
		}
		szoveg(tomb);
	});
	sajatalszamszamkent = sajatalszamszamkent + 1;
	techsajatalszamszamkent = sajatalszamszamkent - 1;
	if ($('#szj' + sajatfoszamszamkent + '_' + (sajatalszamszamkent - 1)).nextAll().eq(2)[0] === undefined) {
		$('#form' + sajatfoszamszamkent + '_' + techsajatalszamszamkent).after(
			'<select id="szj' +
				sajatfoszamszamkent +
				'_' +
				sajatalszamszamkent +
				'"class="custom-select mt-2 col-3 jarmujellemzo mt-2 mb-2"><option value="valasztas">Add new feature</option><option value="border">Border control</option><option value="owner">Owner</option><option value="control">Controlled by the police</option><option value="free">Free text</option></select>'
		);
	}
}

function vehcontrol() {
	$('#' + sajatid).after(
		'<form class="" onsubmit="return false" id="form' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'"><div class="form-row"><input class="form-control mand col div mb-2 mr-sm-2 cplace e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" placeholder="place (mandatory)"><input class="form-control mand col div mb-2 mr-sm-2 ctime e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" placeholder="date (mandatory)"><input class="form-control col div mb-2 mr-sm-2 cvehicle e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" placeholder="user"><input class="form-control col div mb-2 mr-sm-2 cphone e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" placeholder="phone number"></div><legend class="col-form-label pt-0">Personal data of the other controlled person(s)</legend><div class="form-row"><input class="form-control col-2 div mb-2 mr-sm-2 rugvez e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" placeholder="family name"><input class="form-control col-2 div mb-2 mr-sm-2 rugker e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" placeholder="given name"><input class="form-control col div mb-2 mr-sm-2 rugyear e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" placeholder="year of birth"><input class="form-control col div mb-2 mr-sm-2 rugmonth e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" placeholder="month of birth"><input class="form-control col div mb-2 mr-sm-2 rugday e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" placeholder="day of birth"><input class="form-control col-3 div mb-2 mr-sm-2 rugother e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" placeholder="other pers. data"><button type="button" id="b' +
			aktfoszam +
			'" onclick="koztesvegere(this)" class="ujsorbaszemely btn mr-2 btn-sm btn-info mb-2" data-toggle="tooltip" data-placement="top" title="Add this person as a new main object">@</button><button type="button" id="b' +
			aktfoszam +
			'" onclick="megegyszemely(this)" class="szempluszgomb btn mr-2 btn-sm btn-info mb-2" data-toggle="tooltip" data-placement="top" title="Add a new person to this feature">+</button></div><div class="form-row"><input class="form-control col div mb-2 mr-sm-2 free e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" placeholder="free text"><button type="button" id="b' +
			aktfoszam +
			'" onclick="featuretorles(this)" class="btn mr-2 btn-sm btn-outline-danger mb-2" data-toggle="tooltip" data-placement="top" title="Remove this feature">-</button><button type="submit" class="gomb btn btn-primary mb-2" id="e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'">Add</button></div></form>'
	);
	$('#e' + sajatfoszamszamkent + '_' + sajatalszamszamkent).on('click', function(prop) {
		prop.stopPropagation();
		$(this).text('Update');
		aktualisid = $(this).attr('id');
		aktfoszam = $(this).attr('id').slice(1, $(this).attr('id').indexOf('_'));
		var egyebszem = szemelygen();
		var chelyido = 'In ' + $('.cplace.' + aktualisid).val() + ' on ' + $('.ctime.' + aktualisid).val() + '.';
		if ($('.cvehicle.' + aktualisid).val() != '') {
			var cvehicle = ' User(s) of the vehicle: ' + $('.cvehicle.' + aktualisid).val() + '.';
		} else {
			var cvehicle = '';
		}
		if ($('.cphone.' + aktualisid).val() != '') {
			var cphone =
				' During the control this person provided this phone number: ' +
				$('.cphone.' + aktualisid).val() +
				' as an own one. ';
		} else {
			var cphone = '';
		}
		if (egyebszem != '') {
			egyebszem =
				' This individual was together with the following person(s) during the control: ' + egyebszem + '. ';
		}
		var vkontr = chelyido + cvehicle + cphone + egyebszem + $('.free.' + aktualisid).val();
		if (tomb[aktfoszam].vehcontroll === undefined) {
			tomb[aktfoszam].vehcontroll = [];
		}
		tarolo = 0;
		tomb[aktfoszam].vehcontroll.forEach(function(i, index) {
			if (i.kapcs === aktualisid) {
				tomb[aktfoszam].vehcontroll[index] = {
					tart: vkontr,
					kapcs: aktualisid,
					bevez: 'This vehicle was controlled by the police: '
				};
				tarolo = 1;
			}
		});
		if (tarolo === 0) {
			tomb[aktfoszam].vehcontroll.push({
				tart: vkontr,
				kapcs: aktualisid,
				bevez: 'This vehicle was controlled by the police: '
			});
		}
		szoveg(tomb);
	});
	sajatalszamszamkent = sajatalszamszamkent + 1;
	techsajatalszamszamkent = sajatalszamszamkent - 1;
	if ($('#szj' + sajatfoszamszamkent + '_' + (sajatalszamszamkent - 1)).nextAll().eq(2)[0] === undefined) {
		$('#form' + sajatfoszamszamkent + '_' + techsajatalszamszamkent).after(
			'<select id="szj' +
				sajatfoszamszamkent +
				'_' +
				sajatalszamszamkent +
				'"class="custom-select mt-2 col-3 jarmujellemzo mt-2 mb-2"><option value="valasztas">Add new feature</option><option value="border">Border control</option><option value="owner">Owner</option><option value="control">Controlled by the police</option><option value="free">Free text</option></select>'
		);
	}
}

function vehowner() {
	$('#' + sajatid).after(
		'<form class="" onsubmit="return false" id="form' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'"><div class="form-row"><select class="custom-select mand col-3 mb-2 mr-2 vowner e' +
			aktfoszam +
			'_' +
			sajatalszamszamkent +
			'"><option value="owneruser">owner/registered user (mand.)</option><option value="owner">owner</option><option value="registered user">registered user</option></select><input class="form-control col div mb-2 mr-sm-2 osince e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" placeholder="since"><div class="form-check form-check-inline"><input type="checkbox" class="form-check-input norelpf e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" id="norelpf e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" class="norelpf e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'"><label class="form-check-label" for="norelpf e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'">No relevant police files </label></div></div><div class="form-row"><input class="form-control mand col-2 div mb-2 mr-sm-2 rugvez e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" placeholder="family name (mandatory)"><input class="form-control mand col-2 div mb-2 mr-sm-2 rugker e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" placeholder="given name (mandatory)"><input class="form-control col div mb-2 mr-sm-2 rugyear e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" placeholder="year of birth"><input class="form-control col div mb-2 mr-sm-2 rugmonth e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" placeholder="month of birth"><input class="form-control col div mb-2 mr-sm-2 rugday e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" placeholder="day of birth"><input class="form-control col-3 div mb-2 mr-sm-2 rugother e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" placeholder="other pers. data"><button type="button" id="b' +
			aktfoszam +
			'" onclick="koztesvegere(this)" class="ujsorbaszemely btn mr-2 btn-sm btn-info mb-2" data-toggle="tooltip" data-placement="top" title="Add this person as a new main object">@</button></div><div class="form-row"><input class="form-control col div mb-2 mr-sm-2 free e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" placeholder="free text"><button type="button" id="b' +
			aktfoszam +
			'" onclick="featuretorles(this)" class="btn mr-2 btn-sm btn-outline-danger mb-2" data-toggle="tooltip" data-placement="top" title="Remove this feature">-</button><button type="submit" class="gomb btn btn-primary mb-2" id="e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'">Add</button></div></form>'
	);
	$('#e' + sajatfoszamszamkent + '_' + sajatalszamszamkent).on('click', function(prop) {
		prop.stopPropagation();
		$(this).text('Update');
		aktualisid = $(this).attr('id');
		aktfoszam = $(this).attr('id').slice(1, $(this).attr('id').indexOf('_'));
		var tulaj = szemelygen();
		var vehtszoveg = 'The ' + $('.vowner.' + aktualisid).val() + ' of the vehicle ';
		if ($('.cvehicle.' + aktualisid).val() != '') {
			var cvehicle = ' User(s) of the vehicle: ' + $('.cvehicle.' + aktualisid).val() + '.';
		} else {
			var cvehicle = '';
		}
		if ($('.osince.' + aktualisid).val() != '') {
			var osince = ' - since ' + $('.osince.' + aktualisid).val() + ' - ';
		} else {
			var osince = '';
		}
		if ($('.norelpf.' + aktualisid)[0].checked === true) {
			var norelpf = ' This person has no relevant police files in my country. ';
		} else {
			var norelpf = '';
		}
		var vehtulaj = vehtszoveg + 'is ' + osince + tulaj + '. ' + norelpf + $('.free.' + aktualisid).val();
		if (tomb[aktfoszam].vehhasznalo === undefined) {
			tomb[aktfoszam].vehhasznalo = [];
		}
		tarolo = 0;
		tomb[aktfoszam].vehhasznalo.forEach(function(i, index) {
			if (i.kapcs === aktualisid) {
				tomb[aktfoszam].vehhasznalo[index] = {
					tart: vehtulaj,
					kapcs: aktualisid,
					bevez: 'Related person(s): '
				};
				tarolo = 1;
			}
		});
		if (tarolo === 0) {
			tomb[aktfoszam].vehhasznalo.push({ tart: vehtulaj, kapcs: aktualisid, bevez: 'Related person(s): ' });
		}
		szoveg(tomb);
	});
	sajatalszamszamkent = sajatalszamszamkent + 1;
	techsajatalszamszamkent = sajatalszamszamkent - 1;
	if ($('#szj' + sajatfoszamszamkent + '_' + (sajatalszamszamkent - 1)).nextAll().eq(2)[0] === undefined) {
		$('#form' + sajatfoszamszamkent + '_' + techsajatalszamszamkent).after(
			'<select id="szj' +
				sajatfoszamszamkent +
				'_' +
				sajatalszamszamkent +
				'"class="custom-select mt-2 col-3 jarmujellemzo mt-2 mb-2"><option value="valasztas">Add new feature</option><option value="border">Border control</option><option value="owner">Owner</option><option value="control">Controlled by the police</option><option value="free">Free text</option></select>'
		);
	}
}

function vehfree() {
	$('#' + sajatid).after(
		'<form class="form-inline" onsubmit="return false" id="form' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'"><textarea class="form-control col div mb-2 mr-sm-2 free e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" rows=5" placeholder="free text"></textarea><button type="button" id="b' +
			aktfoszam +
			'" onclick="featuretorles(this)" class="btn mr-2 btn-outline-danger mb-2" data-toggle="tooltip" data-placement="top" title="Remove this feature">-</button><button type="submit" class="gomb btn btn-primary mb-2" id="e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'">Add</button><br></form>'
	);
	$('#e' + sajatfoszamszamkent + '_' + sajatalszamszamkent).on('click', function(prop) {
		prop.stopPropagation();
		$(this).text('Update');
		aktualisid = $(this).attr('id');
		aktfoszam = $(this).attr('id').slice(1, $(this).attr('id').indexOf('_'));
		var vfreetext = $('.free.' + aktualisid).val();
		if (tomb[aktfoszam].vehszabad === undefined) {
			tomb[aktfoszam].vehszabad = [];
		}
		tarolo = 0;
		tomb[aktfoszam].vehszabad.forEach(function(i, index) {
			if (i.kapcs === aktualisid) {
				tomb[aktfoszam].vehszabad[index] = { tart: vfreetext, kapcs: aktualisid, bevez: '' };
				tarolo = 1;
			}
		});
		if (tarolo === 0) {
			tomb[aktfoszam].vehszabad.push({ tart: vfreetext, kapcs: aktualisid, bevez: '' });
		}
		szoveg(tomb);
	});
	sajatalszamszamkent = sajatalszamszamkent + 1;
	techsajatalszamszamkent = sajatalszamszamkent - 1;
	if ($('#szj' + sajatfoszamszamkent + '_' + (sajatalszamszamkent - 1)).nextAll().eq(2)[0] === undefined) {
		$('#form' + sajatfoszamszamkent + '_' + techsajatalszamszamkent).after(
			'<select id="szj' +
				sajatfoszamszamkent +
				'_' +
				sajatalszamszamkent +
				'"class="custom-select mt-2 col-3 jarmujellemzo mt-2 mb-2"><option value="valasztas">Add new feature</option><option value="border">Border control</option><option value="owner">Owner</option><option value="control">Controlled by the police</option><option value="free">Free text</option></select>'
		);
	}
}

function issuedto() {
	$('#' + sajatid).after(
		'<form class="" onsubmit="return false" id="form' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'"><div class="form-row"><input class="form-control mand col-2 div mb-2 mr-sm-2 rugvez e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" placeholder="family name"><input class="form-control col-2 mand div mb-2 mr-sm-2 rugker e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" placeholder="given name"><input class="form-control col div mb-2 mr-sm-2 rugyear e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" placeholder="year of birth"><input class="form-control col div mb-2 mr-sm-2 rugmonth e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" placeholder="month of birth"><input class="form-control col div mb-2 mr-sm-2 rugday e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" placeholder="day of birth"><input class="form-control col-3 div mb-2 mr-sm-2 rugother e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" placeholder="other pers. data"><button type="button" id="b' +
			aktfoszam +
			'" onclick="koztesvegere(this)" class="ujsorbaszemely btn mr-2 btn-sm btn-info mb-2" data-toggle="tooltip" data-placement="top" title="Add this person as a new main object">@</button></div><div class="form-check form-check-inline"><input type="checkbox" id="noconv e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" class="form-check-input noconv e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'"><label for="noconv e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" class="form-check-label">No convictions of the owner </label></div><div class="form-check form-check-inline"><input type="checkbox" id="nopol e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" class="form-check-input nopol e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'"><label for="nopol e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" class="form-check-label">No police files of the owner </label></div><div class="form-row"><input class="form-control col div mb-2 mr-sm-2 dfree e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" placeholder="free text"><button type="button" id="b' +
			aktfoszam +
			'" onclick="featuretorles(this)" class="btn mr-2 btn-sm btn-outline-danger mb-2" data-toggle="tooltip" data-placement="top" title="Remove this feature">-</button><button type="submit" class="gomb btn btn-primary mb-2" id="e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'">Add</button><br></div></form>'
	);
	$('#e' + sajatfoszamszamkent + '_' + sajatalszamszamkent).on('click', function(prop) {
		prop.stopPropagation();
		$(this).text('Update');
		aktualisid = $(this).attr('id');
		aktfoszam = $(this).attr('id').slice(1, $(this).attr('id').indexOf('_'));
		var tulaj = szemelygen();
		if ($('.noconv.' + aktualisid)[0].checked === true) {
			var noconv = ' The owner has no convictions. ';
		} else {
			var noconv = '';
		}
		if ($('.nopol.' + aktualisid)[0].checked === true) {
			var nopol = ' This person has no (relevant) police files in my country. ';
		} else {
			var nopol = '';
		}
		var kibocs =
			'This document was issued to: ' + tulaj + '. ' + noconv + nopol + ' ' + $('.dfree.' + aktualisid).val();
		if (tomb[aktfoszam].docissued === undefined) {
			tomb[aktfoszam].docissued = [];
		}
		tarolo = 0;
		tomb[aktfoszam].docissued.forEach(function(i, index) {
			if (i.kapcs === aktualisid) {
				tomb[aktfoszam].docissued[index] = { tart: kibocs, kapcs: aktualisid, bevez: '' };
				tarolo = 1;
			}
		});
		if (tarolo === 0) {
			tomb[aktfoszam].docissued.push({ tart: kibocs, kapcs: aktualisid, bevez: '' });
		}
		szoveg(tomb);
	});
	sajatalszamszamkent = sajatalszamszamkent + 1;
	techsajatalszamszamkent = sajatalszamszamkent - 1;
	if ($('#szj' + sajatfoszamszamkent + '_' + (sajatalszamszamkent - 1)).nextAll().eq(2)[0] === undefined) {
		$('#form' + sajatfoszamszamkent + '_' + techsajatalszamszamkent).after(
			'<select id="szj' +
				sajatfoszamszamkent +
				'_' +
				sajatalszamszamkent +
				'"class="custom-select mt-2 col-3 mt-2 mb-2 docjellemzo"><option value="valasztas">Add new feature</option><option value="issuedto">Issued to</option><option value="issuedon">Valid/issued on</option><option value="lost/stolen">Lost/stolen</option><option value="free">Free text</option></select>'
		);
	}
}

function issuedon() {
	$('#' + sajatid).after(
		'<form class="" onsubmit="return false" id="form' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'"><div class="form-row"><input class="form-control col div mb-2 mr-sm-2 dissuedon e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" placeholder="issued on"><input class="form-control col div mb-2 mr-sm-2 dvalidtill e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" placeholder="valid till"></div><div class="form-row"><input class="form-control col div mb-2 mr-sm-2 dfree e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" placeholder="free text"><button type="button" id="b' +
			aktfoszam +
			'" onclick="featuretorles(this)" class="btn mr-2 btn-sm btn-outline-danger mb-2" data-toggle="tooltip" data-placement="top" title="Remove this feature">-</button><button type="submit" class="gomb btn btn-primary mb-2" id="e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'">Add</button><br></div></form>'
	);
	$('#e' + sajatfoszamszamkent + '_' + sajatalszamszamkent).on('click', function(prop) {
		prop.stopPropagation();
		$(this).text('Update');
		aktualisid = $(this).attr('id');
		aktfoszam = $(this).attr('id').slice(1, $(this).attr('id').indexOf('_'));
		if ($('.dissuedon.' + aktualisid).val() != '') {
			var dissuedon = 'This document was issued on: ' + $('.dissuedon.' + aktualisid).val() + '.';
		} else {
			var dissuedon = '';
		}
		if ($('.dvalidtill.' + aktualisid).val() != '') {
			var dvalidtill = ' It is valid until: ' + $('.dvalidtill.' + aktualisid).val() + '.';
		} else {
			var dvalidtill = '';
		}
		var ervenyesseg = dissuedon + dvalidtill + $('.dfree.' + aktualisid).val();
		if (tomb[aktfoszam].docissuedon === undefined) {
			tomb[aktfoszam].docissuedon = [];
		}
		tarolo = 0;
		tomb[aktfoszam].docissuedon.forEach(function(i, index) {
			if (i.kapcs === aktualisid) {
				tomb[aktfoszam].docissuedon[index] = { tart: ervenyesseg, kapcs: aktualisid, bevez: '' };
				tarolo = 1;
			}
		});
		if (tarolo === 0) {
			tomb[aktfoszam].docissuedon.push({ tart: ervenyesseg, kapcs: aktualisid, bevez: '' });
		}
		szoveg(tomb);
	});
	sajatalszamszamkent = sajatalszamszamkent + 1;
	techsajatalszamszamkent = sajatalszamszamkent - 1;
	if ($('#szj' + sajatfoszamszamkent + '_' + (sajatalszamszamkent - 1)).nextAll().eq(2)[0] === undefined) {
		$('#form' + sajatfoszamszamkent + '_' + techsajatalszamszamkent).after(
			'<select id="szj' +
				sajatfoszamszamkent +
				'_' +
				sajatalszamszamkent +
				'"class="custom-select mt-2 col-3 mt-2 mb-2 docjellemzo"><option value="valasztas">Add new feature</option><option value="issuedto">Issued to</option><option value="issuedon">Valid/issued on</option><option value="lost/stolen">Lost/stolen</option><option value="free">Free text</option></select>'
		);
	}
}

function doclost() {
	$('#' + sajatid).after(
		'<form class="" onsubmit="return false" id="form' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'"><div class="form-row"><select class="custom-select mand mb-2 mr-2 col-3 dlost e' +
			aktfoszam +
			'_' +
			sajatalszamszamkent +
			'"><option value="lost/stolen">Lost/stolen (mandatory)</option><option value="lost">Lost</option><option value="stolen">Stolen</option></select><input class="form-control mand col div mb-2 mr-sm-2 ddate e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" placeholder="date (mandatory)"></div><div class="form-row"><input class="form-control col div mb-2 mr-sm-2 dfree e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" placeholder="free text"><button type="button" id="b' +
			aktfoszam +
			'" onclick="featuretorles(this)" class="btn mr-2 btn-sm btn-outline-danger mb-2" data-toggle="tooltip" data-placement="top" title="Remove this feature">-</button><button type="submit" class="gomb btn btn-primary mb-2" id="e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'">Add</button><br></div></form>'
	);
	$('#e' + sajatfoszamszamkent + '_' + sajatalszamszamkent).on('click', function(prop) {
		prop.stopPropagation();
		$(this).text('Update');
		aktualisid = $(this).attr('id');
		aktfoszam = $(this).attr('id').slice(1, $(this).attr('id').indexOf('_'));
		var elvdok =
			'This document was reported as ' +
			$('.dlost.' + aktualisid).val() +
			' ' +
			$('.ddate.' + aktualisid).val() +
			'. ' +
			$('.dfree.' + aktualisid).val();
		if (tomb[aktfoszam].docloststolen === undefined) {
			tomb[aktfoszam].docloststolen = [];
		}
		tarolo = 0;
		tomb[aktfoszam].docloststolen.forEach(function(i, index) {
			if (i.kapcs === aktualisid) {
				tomb[aktfoszam].docloststolen[index] = { tart: elvdok, kapcs: aktualisid, bevez: '' };
				tarolo = 1;
			}
		});
		if (tarolo === 0) {
			tomb[aktfoszam].docloststolen.push({ tart: elvdok, kapcs: aktualisid, bevez: '' });
		}
		szoveg(tomb);
	});
	sajatalszamszamkent = sajatalszamszamkent + 1;
	techsajatalszamszamkent = sajatalszamszamkent - 1;
	if ($('#szj' + sajatfoszamszamkent + '_' + (sajatalszamszamkent - 1)).nextAll().eq(2)[0] === undefined) {
		$('#form' + sajatfoszamszamkent + '_' + techsajatalszamszamkent).after(
			'<select id="szj' +
				sajatfoszamszamkent +
				'_' +
				sajatalszamszamkent +
				'"class="custom-select mt-2 col-3 mt-2 mb-2 docjellemzo"><option value="valasztas">Add new feature</option><option value="issuedto">Issued to</option><option value="issuedon">Valid/issued on</option><option value="lost/stolen">Lost/stolen</option><option value="free">Free text</option></select><br>'
		);
	}
}

function docfree() {
	$('#' + sajatid).after(
		'<form class="form-inline" onsubmit="return false" id="form' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'"><textarea class="form-control col div mb-2 mr-sm-2 dfree e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'" type="text" rows="5" placeholder="free text"></textarea><button type="button" id="b' +
			aktfoszam +
			'" onclick="featuretorles(this)" class="btn mr-2 btn-outline-danger mb-2" data-toggle="tooltip" data-placement="top" title="Remove this feature">-</button><button type="submit" class="gomb btn btn-primary mb-2" id="e' +
			sajatfoszamszamkent +
			'_' +
			sajatalszamszamkent +
			'">Add</button><br></form>'
	);
	$('#e' + sajatfoszamszamkent + '_' + sajatalszamszamkent).on('click', function(prop) {
		prop.stopPropagation();
		$(this).text('Update');
		aktualisid = $(this).attr('id');
		aktfoszam = $(this).attr('id').slice(1, $(this).attr('id').indexOf('_'));
		var szabaddok = $('.dfree.' + aktualisid).val();
		if (tomb[aktfoszam].dokumfree === undefined) {
			tomb[aktfoszam].dokumfree = [];
		}
		tarolo = 0;
		tomb[aktfoszam].dokumfree.forEach(function(i, index) {
			if (i.kapcs === aktualisid) {
				tomb[aktfoszam].dokumfree[index] = { tart: szabaddok, kapcs: aktualisid, bevez: '' };
				tarolo = 1;
			}
		});
		if (tarolo === 0) {
			tomb[aktfoszam].dokumfree.push({ tart: szabaddok, kapcs: aktualisid, bevez: '' });
		}
		szoveg(tomb);
	});
	sajatalszamszamkent = sajatalszamszamkent + 1;
	techsajatalszamszamkent = sajatalszamszamkent - 1;
	if ($('#szj' + sajatfoszamszamkent + '_' + (sajatalszamszamkent - 1)).nextAll().eq(2)[0] === undefined) {
		$('#form' + sajatfoszamszamkent + '_' + techsajatalszamszamkent).after(
			'<select id="szj' +
				sajatfoszamszamkent +
				'_' +
				sajatalszamszamkent +
				'"class="custom-select mt-2 col-3 mt-2 mb-2 docjellemzo"><option value="valasztas">Add new feature</option><option value="issuedto">Issued to</option><option value="issuedon">Valid/issued on</option><option value="lost/stolen">Lost/stolen</option><option value="free">Free text</option></select>'
		);
	}
}

$('#nebek').on('click', function() {
	if ($(this).text() === 'NEBEK Notes On') {
		$(this).text('NEBEK Notes Off');
		$('#felsonav').attr('hidden', false);
		$('#felsonebek').attr('hidden', false);
		if ($('#assign').text() === 'Assign Notes Off') {
			$('#elvalaszto').attr('hidden', false);
			$('#assfelsosor').addClass('mt-2');
		}
		$('body').css('padding-top', $('#felsonav').height() + 10);
	} else {
		$(this).text('NEBEK Notes On');
		if ($('#felsoassign').attr('hidden') === 'hidden') {
			$('#felsonav').attr('hidden', true);
		}
		$('#felsonebek').attr('hidden', true);
		if ($('#assign').text() === 'Assign Notes On') {
			$('body').css('padding-top', 10);
		} else {
			$('body').css('padding-top', $('#felsonav').height() + 10);
		}
		$('#elvalaszto').attr('hidden', true);
		$('#assfelsosor').removeClass('mt-2');
	}
});

function nebekuz() {
	// var technikai = 0;
	// if (mnebekatall === false){
	// 	margo = margo + 40;
	// }
	// $("body").css("padding-top", margo + "px");
	// mnebekatall = true;
	$('#nebekuzenet').addClass('nebekuzenethatter');
	var tukmondoc = $('#felsotuk').val();
	var siena = $('#siena').val();
	var nebekel = $('#nebekel').val();
	if ($('#szelesseg').val() != '') {
		var szelesseg = 'Kérjük ' + $('#szelesseg').val();
	} else {
		var szelesseg = '';
	}
	if ($('#nuszfent')[0].checked === true) {
		var nuszfent =
			'Kérjük a megadott rendszám(ok) mozgásának ellenőrzését a kérdéses időszakra a NÚSZ-on keresztül. ';
	} else {
		var nuszfent = '';
	}
	if ($('#oiffent')[0].checked === true) {
		var oiffent = 'Kérjük a vonatkozó személy idegenrendészeti háttéranyagának beszerzését az OIF-en keresztül. ';
	} else {
		var oiffent = '';
	}
	if ($('#ujjfent')[0].checked === true) {
		var ujjfent = 'Kérjük a megadott személy ujjnyomatlapjának beszerzését az NSZKK-n keresztül. ';
	} else {
		var ujjfent = '';
	}
	if ($('#dnsfent')[0].checked === true) {
		var dnsfent = 'Kérjük a megadott megadott személy DNS-adatlapjának beszerzését az NSZKK-n keresztül. ';
	} else {
		var dnsfent = '';
	}
	if ($('#eloffent')[0].checked === true) {
		var eloffent = 'Kérjük a megadott megadott hívószám(ok) előfizetőjének a megállapítását. ';
	} else {
		var eloffent = '';
	}
	if ($('#reffent')[0].checked === true) {
		var reffent = 'Tekintettel a ...tájékoztatás (referáda) céljából továbbítom az üzenetet. ';
	} else {
		var reffent = '';
	}
	$('#nebekuzenet').text(
		'T. NEBEK! ' +
			tukmondoc +
			', SIENA ' +
			siena +
			', NEBEK előzmény: ' +
			nebekel +
			'. ' +
			nuszfent +
			oiffent +
			ujjfent +
			dnsfent +
			eloffent +
			reffent +
			szelesseg
	);
	$('#nebekuzenet').attr('data-toggle', 'tooltip');
	$('#nebekuzenet').attr('data-placement', 'top');
	$('#nebekuzenet').attr('title', 'This message is editable!');
	$('[data-toggle="tooltip"]').tooltip();
	if ($('#nebekszerk')[0] === undefined) {
		//$("#nebekuzenet").after('<button type="button" id="nebekedit" class="mb-2 ml-2 mr-2 btn btn-outline-warning" onclick="nebekedit()">Edit</button>');
		$('#nebekuzenet').after(
			'<button type="button" id="nebekszerk" class="mb-2 ml-2 btn btn-outline-success" onclick="nebekcopy()">Copy</button>'
		);
	}
	$('body').css('padding-top', $('#felsonav').height() + 10);
	nebekedit();
}

function nebekcopy() {
	function listener(e) {
		e.clipboardData.setData('text/plain', document.getElementById('nebekuzenet').textContent);
		e.preventDefault();
	}
	document.addEventListener('copy', listener);
	document.execCommand('copy');
	document.removeEventListener('copy', listener);
}

function nebekedit() {
	$('#nebekuzenet').attr('contenteditable', 'true');
	document.querySelector('#nebekuzenet').addEventListener('paste', function(event) {
		event.preventDefault();
		document.execCommand('inserttext', false, event.clipboardData.getData('text/plain'));
	});
	$('#nebekuzenet').addClass('szerktartalom');
}

$('#assign').on('click', function() {
	if ($(this).text() === 'Assign Notes On') {
		$(this).text('Assign Notes Off');
		$('#felsonav').attr('hidden', false);
		$('#felsoassign').attr('hidden', false);
		if ($('#nebek').text() === 'NEBEK Notes Off') {
			$('#elvalaszto').attr('hidden', false);
			$('#assfelsosor').addClass('mt-2');
		} else {
			$('#elvalaszto').attr('hidden', true);
			$('#assfelsosor').removeClass('mt-2');
		}
		$('body').css('padding-top', $('#felsonav').height() + 10);
	} else {
		$(this).text('Assign Notes On');
		if ($('#felsonebek').attr('hidden') === 'hidden') {
			$('#felsonav').attr('hidden', true);
		}
		$('#felsoassign').attr('hidden', true);

		if ($('#nebek').text() === 'NEBEK Notes On') {
			$('body').css('padding-top', 10);
		} else {
			$('body').css('padding-top', $('#felsonav').height() + 10);
		}
		$('#elvalaszto').attr('hidden', true);
	}
});

function assignuz() {
	// var technikai = 0;
	// if (massignatall === false){
	// 	margo = margo + 40;
	// }
	// $("body").css("padding-top", margo + "px");
	// massignatall = true;
	$('#assignuzenet').addClass('assignuzenethatter');
	var tukmondoc = $('#felsotuk').val();
	var siena = $('#siena').val();
	var nebekel = $('#nebekel').val();
	if ($('#szelesseg').val() != '') {
		var szelesseg = 'Kérjük ' + $('#szelesseg').val();
	} else {
		var szelesseg = '';
	}
	if ($('#partment')[0].checked === true) {
		var partment = ' Részleges választ küldtünk.';
	} else {
		var partment = '';
	}
	if ($('#kossz')[0].checked === true) {
		var kossz = ' Köszönjük.';
	} else {
		var kossz = '';
	}
	$('#assignuzenet').text(
		'T. Kollégák! Tekintettel arra, hogy az üzenetben szereplő ' +
			$('#obj').val() +
			' a ' +
			$('#szervezet').val() +
			' által folytatott ' +
			$('#eljar').val() +
			' számú eljárásban felmerült, továbbítom a megkeresést ' +
			$('#cel').val() +
			'.' +
			partment +
			kossz
	);
	$('#assignuzenet').attr('data-toggle', 'tooltip');
	$('#assignuzenet').attr('data-placement', 'top');
	$('#assignuzenet').attr('title', 'This message is editable!');
	$('[data-toggle="tooltip"]').tooltip();
	if ($('#assignszerk')[0] === undefined) {
		$('#assignuzenet').after(
			'<button type="button" id="assignszerk" class="form-inline mb-2 ml-2 btn btn-outline-success" onclick="assigncopy()">Copy</button>'
		);
		//$("#assignuzenet").after('<button type="button" id="assignedit" class="form-inline mb-2 ml-2 mr-2 btn btn-outline-warning" onclick="assignedit()">Edit</button>');
	}
	$('body').css('padding-top', $('#felsonav').height() + 10);
	assignedit();
}

function assigncopy() {
	function listener(e) {
		e.clipboardData.setData('text/plain', document.getElementById('assignuzenet').textContent);
		e.preventDefault();
	}
	document.addEventListener('copy', listener);
	document.execCommand('copy');
	document.removeEventListener('copy', listener);
}

function assignedit() {
	$('#assignuzenet').attr('contenteditable', 'true');
	document.querySelector('#assignuzenet').addEventListener('paste', function(event) {
		event.preventDefault();
		document.execCommand('inserttext', false, event.clipboardData.getData('text/plain'));
	});
	$('#assignuzenet').addClass('szerktartalom');
}

function mitszerkeszt(placeh) {
	$('#' + placeh).keypress(function(event) {
		$('#' + placeh.slice(3, placeh.length)).css('background-color', 'FIREBRICK');
		$('#' + placeh.slice(3, placeh.length)).attr('data-toggle', 'tooltip');
		$('#' + placeh.slice(3, placeh.length)).attr('data-placement', 'top');
		$('#' + placeh.slice(3, placeh.length)).attr(
			'title',
			'Caution! The text, that is generated using this field, has been manually edited. If you click on this button your changes may lose.'
		);
		$('[data-toggle="tooltip"]').tooltip();
		//data-toggle="tooltip" data-placement="top" title="Remove this object"
	});
}

function nembeloves() {
	neme = $('.sex.' + 'e' + aktfoszam + '_0').val();
	nemekisbetu = neme.toLowerCase();
	if (neme === 'He') {
		birtokosneme = 'his';
	} else if (neme === 'She') {
		birtokosneme = 'her';
	} else {
		birtokosneme = 'his/her';
	}
	birtokosnemenagyb = birtokosneme.charAt(0).toUpperCase() + birtokosneme.slice(1);
}

fofunkcio();
