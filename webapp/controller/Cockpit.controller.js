sap.ui.define([
	"./BaseController",
	"sap/ui/model/json/JSONModel",
	"../model/formatter",
	"sap/ui/model/Filter",
	"sap/ui/model/FilterOperator"
], function (BaseController, JSONModel, formatter, Filter, FilterOperator) {
	"use strict";
	var that = this;
	
	return BaseController.extend("com.einv.sd.process.controller.Cockpit", {

		formatter: formatter,

		/* =========================================================== */
		/* lifecycle methods                                           */
		/* =========================================================== */

		/**
		 * Called when the cockpit controller is instantiated.
		 * @public
		 */
		onInit: function () {
			that = this;

			var oViewModel,
				iOriginalBusyDelay,
				oTable = this.byId("table");

			this._oTable = oTable;

			// Put down cockpit table's original value for busy indicator delay,
			// so it can be restored later on. Busy handling on the table is
			// taken care of by the table itself.
			iOriginalBusyDelay = oTable.getBusyIndicatorDelay();
			// keeps the search state
			this._aTableSearchState = [];

			var iShowRows = 10,
				iHeight = sap.ui.Device.resize.height;

			if (iHeight < 650) {
				iShowRows = 7;
			}
			if (iHeight > 650 && iHeight < 750) {
				iShowRows = 9;
			} else if (iHeight > 750 && iHeight < 850) {
				iShowRows = 12;
			} else if (iHeight > 850 && iHeight < 950) {
				iShowRows = 15;
			} else if (iHeight > 950 && iHeight < 1050) {
				iShowRows = 17;
			} else if (iHeight > 1050) {
				iShowRows = 20;
			}

			// Model used to manipulate control states
			oViewModel = new JSONModel({
				cockpitTableTitle: this.getResourceBundle().getText("cockpitTableTitle"),
				tableNoDataText: this.getResourceBundle().getText("tableNoDataText"),
				tableBusyDelay: 0,
				iShowRows: iShowRows
			});
			this.setModel(oViewModel, "cockpitView");

			// Make sure, busy indication is showing immediately so there is no
			// break after the busy indication for loading the view's meta data is
			// ended (see promise 'oWhenMetadataIsLoaded' in AppController)
			oTable.attachEventOnce("updateFinished", function () {
				// Restore original busy indicator delay for cockpit's table
				oViewModel.setProperty("/tableBusyDelay", iOriginalBusyDelay);
			});

			var oObjectPageLayout = that.getView().byId("dynamicPageId");
			oObjectPageLayout.setShowFooter(false);

			that._fnPrepareUiTable();
			that._fnMultiInputAddValidator();

			this.getRouter().getRoute("cockpit").attachPatternMatched(this._onObjectMatched, this);
		},

		/* =========================================================== */
		/* event handlers                                              */
		/* =========================================================== */

		/**
		 * Event handler for navigating back.
		 * We navigate back in the browser history
		 * @public
		 */
		onNavBack: function () {
			// eslint-disable-next-line sap-no-history-manipulation
			history.go(-1);
		},

		onSearch: function (oEvent) {
			var oFilterBar = oEvent.getSource();
			var aFilterItems = oFilterBar.getFilterItems();
			var aFilters = [];

			for (var oFil in aFilterItems) {
				if (aFilterItems[oFil].getVisibleInFilterBar()) {
					var sFilterName = aFilterItems[oFil].getName();
					var oControl = oFilterBar.determineControlByFilterItem(aFilterItems[oFil]);
					var sValue = "";

					if (oControl.getMetadata().getName() === "sap.m.MultiInput") {
						var aTokens = oControl.getTokens();
						for (var oItem in aTokens) {
							sValue += (!parseInt(oItem, 10) ? "" : "$") + aTokens[oItem].getKey();
						}
					} else if (oControl.getMetadata().getName() === "sap.m.CheckBox") {
						sValue = oControl.getSelected() ? "X" : "";
					}

					var oFilter = new sap.ui.model.Filter(sFilterName, "EQ", sValue);
					aFilters.push(oFilter);
				}
			}

			that._oTable.getBinding("rows").filter(aFilters);
		},

		onClearFilters: function (oEvent) {

		},

		onPressShowSettings: function () {
			var oTabColModel = that.oView.getModel("tableCols");
			var oTable = this.getView().byId("table"),
				aColumns = oTable.getColumns();
			var aColTexts = [];

			aColTexts = aColumns.map(function (oItem) {
				return oItem.getLabel().getText();
			});

			var oDialog = new sap.m.SelectDialog({
				title: "Select Columns",
				growing: false,
				confirm: that.onTableColumnSelect,
				search: that.onTableColumnSearch
			});
			oDialog.setModel(oTabColModel, "tableCols");
			var oTemplate = new sap.m.ObjectListItem({
				title: "{tableCols>value}"
			});
			oDialog.bindAggregation("items", "tableCols>/", oTemplate);
			oDialog.setMultiSelect(true);
			oDialog.addStyleClass("sapUiSizeCompact");

			var aItems = oDialog.getItems();

			for (var oItem in aItems) {
				if (aColTexts.indexOf(aItems[oItem].getBindingContext("tableCols").getProperty("value")) > -1) {
					aItems[oItem].setSelected(true);
				}
			}

			oDialog.open();
		},

		onTableColumnSelect: function (oEvent) {
			var aSelCols = oEvent.getParameter("selectedItems");
			var oTable = that.getView().byId("table"),
				aColumns = oTable.getColumns();
			var aColTexts = [];
			var oCntx;

			aColTexts = aColumns.map(function (oItem) {
				return oItem.getLabel().getText();
			});

			for (var oCol in aSelCols) {
				oCntx = aSelCols[oCol].getBindingContext("tableCols");
				if (aColTexts.indexOf(aSelCols[oCol].getTitle()) < 0) {
					oTable.addColumn(new sap.ui.table.Column({
						width: "8rem",
						filterProperty: oCntx.getProperty("name"),
						sortProperty: oCntx.getProperty("name"),
						label: new sap.m.Label({
							text: oCntx.getProperty("value")
						}),
						template: new sap.m.Label({
							text: "{table>" + oCntx.getProperty("value") + "}"
						})
					}));
				}
			}
		},

		onTableColumnSearch: function (oEvent) {
			var oBinding = oEvent.getSource().getBinding("items");
			var oValue = oEvent.getParameter("value");
			var aFilter = new Filter({
				filters: [
					new Filter("value", sap.ui.model.FilterOperator.Contains, oValue)
				],
				and: false
			});
			oBinding.filter([aFilter]);
		},

		/* =========================================================== */
		/* internal methods                                            */
		/* =========================================================== */

		/**
		 * Internal helper method to apply both filter and search state together on the list binding
		 * @param {sap.ui.model.Filter[]} aTableSearchState An array of filters for the search
		 * @private
		 */
		_applySearch: function (aTableSearchState) {
			var oTable = this.byId("table"),
				oViewModel = this.getModel("cockpitView");
			oTable.getBinding("items").filter(aTableSearchState, "Application");
			// changes the noDataText of the list in case there are no filter results
			if (aTableSearchState.length !== 0) {
				oViewModel.setProperty("/tableNoDataText", this.getResourceBundle().getText("cockpitNoDataWithSearchText"));
			}
		},

		_onObjectMatched: function () {

		},

		_fnPrepareUiTable: function () {
			var oTable = that._oTable;
			var oTableObj = {};
			var oModel = that.getOwnerComponent().getModel();

			oModel.metadataLoaded().then(function () {
				try {
					var oMeta = oModel.getServiceMetadata();
					var aEntityTypes = oMeta.dataServices.schema[0].entityType;
					var sKey, oProp, aProperties, aLabel;
					var aCols = [];

					for (sKey in aEntityTypes) {
						if (aEntityTypes[sKey].name === "InvoicingProcess") {
							aProperties = aEntityTypes[sKey].property;
							break;
						}
					}

					for (oProp in aProperties) {
						aLabel = aProperties[oProp].extensions.filter(function (oItem) {
							if (oItem.name === "label") {
								return oItem;
							}
						});
						aCols.push({
							name: aProperties[oProp].name,
							value: aLabel.length ? aLabel[0].value : ""
						});
					}

					var oTableModel = new JSONModel(aCols);
					oTableModel.setSizeLimit(1000);
					that.oView.setModel(oTableModel, "tableCols");

					for (oProp in aProperties) {
						aLabel = aProperties[oProp].extensions.filter(function (oItem) {
							if (oItem.name === "label") {
								return oItem;
							}
						});
						oTableObj[aProperties[oProp].name] = aLabel.length ? aLabel[0].value : "";
					}

					oTable.removeAllColumns();

					var aDates = ["BillingDate", "CreatedOn"],
						aTimes = ["EntryTime", "Time", "IRNCancellationTim"];
					var sText = oProp,
						oLabel;

					for (oProp in oTableObj) {
						if (aDates.indexOf(oProp) > -1) {
							/*sText = {
								path: '/' + oProp,
								formatter: 'sap.ui.model.type.Date',
								formatOptions: {
									pattern: 'yyyy/MM/dd'
								}
							};*/
							oLabel = new sap.m.Label({
								
								text: "{path: '/" + oProp + "', formatter: 'sap.ui.model.type.Date',formatOptions: {pattern: 'yyyy/MM/dd'}}"
							});
						} else if (aTimes.indexOf(oProp) > -1) {
							/*sText = {
								path: "/" + oProp + '/ms',
								type: 'sap.ui.model.type.Time',
								formatOptions: {
									source: {
										pattern: '\'PT\'hh\'H\'mm\'M\'ss\'S\''
									},
									pattern: 'HH:mm:ss'
								}
							};*/
							
							

							oLabel = new sap.m.Label({
								text: "{path:'/" + oProp + "', formatter: '._formatTime'}"
							});
						} else {
							oLabel = new sap.m.Label({
								text: "{" + oProp + "}"
							});
						}

						oTable.addColumn(new sap.ui.table.Column({
							width: Object.keys(oTableObj).length > 10 ? "8rem" : "auto",
							label: new sap.m.Label({
								text: oTableObj[oProp]
							}),
							template: oLabel
						}));
					}

					oTable.bindRows("/InvoicingProcessSet");
				} catch (e) {
					sap.m.MessageToast.show(e.toString());
				}
			});
		},
		
		_formatTime: function(val) {
			if (val) {
			    val = val.replace(/^PT/, '').replace(/S$/, '');
			    val = val.replace('H', ':').replace('M', ':');
			
			    var multipler = 60 * 60;
			    var result = 0;
			    val.split(':').forEach(function(token) {
			      result += token * multipler;
			      multipler = multipler/ 60;
			    });
			    var timeinmiliseconds = result * 1000;
			
			    var timeFormat = sap.ui.core.format.DateFormat.getTimeInstance({
			      pattern: "HH:mm:ss a"
			    });
			    var TZOffsetMs = new Date(0).getTimezoneOffset() * 60 * 1000;
			    return timeFormat.format(new Date(timeinmiliseconds + TZOffsetMs));
			  }
			  return null;
		},
		
		_fnMultiInputAddValidator: function () {
			var oView = that.getView();
			var aValidator = [
				"CompanyCode", "BusinessPlace", "SupplierGSTIN", "DocumentNumber", "DocumentStatus", "CreatedBy", "CreatedOn",
				"Time", "InvoiceType", "Receiver", "ReceiverGSTIN", "OrderNumber", "DeliveryNumber", "InvoiceNumber", "BillingDate",
				"BillingType", "Province", "Period"
			];

			for (var oValidator in aValidator) {
				var fnValidator = function (args) {
					var text = args.text;

					return new sap.m.Token({
						key: text,
						text: text
					});
				};

				oView.byId(aValidator[oValidator]).addValidator(fnValidator);
			}
		}

	});

});