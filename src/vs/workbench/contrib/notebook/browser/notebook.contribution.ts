/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { coalesce, distinct } from 'vs/base/common/arrays';
import { Schemas } from 'vs/base/common/network';
import { IDisposable, Disposable } from 'vs/base/common/lifecycle';
import { parse } from 'vs/base/common/marshalling';
import { isEqual } from 'vs/base/common/resources';
import { assertType } from 'vs/base/common/types';
import { URI } from 'vs/base/common/uri';
import { ITextModel, ITextBufferFactory, DefaultEndOfLine, ITextBuffer } from 'vs/editor/common/model';
import { IModelService } from 'vs/editor/common/services/modelService';
import { IModeService } from 'vs/editor/common/services/modeService';
import { ITextModelContentProvider, ITextModelService } from 'vs/editor/common/services/resolverService';
import * as nls from 'vs/nls';
import { Extensions, IConfigurationRegistry } from 'vs/platform/configuration/common/configurationRegistry';
import { IEditorOptions, ITextEditorOptions, IResourceEditorInput, EditorOverride } from 'vs/platform/editor/common/editor';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { Registry } from 'vs/platform/registry/common/platform';
import { EditorDescriptor, EditorsAssociations, editorsAssociationsSettingId, Extensions as EditorExtensions, IEditorRegistry } from 'vs/workbench/browser/editor';
import { Extensions as WorkbenchExtensions, IWorkbenchContribution, IWorkbenchContributionsRegistry } from 'vs/workbench/common/contributions';
import { EditorInput, Extensions as EditorInputExtensions, ICustomEditorInputFactory, IEditorInput, IEditorInputSerializer, IEditorInputFactoryRegistry, IEditorInputWithOptions } from 'vs/workbench/common/editor';
import { IBackupFileService } from 'vs/workbench/services/backup/common/backup';
import { NotebookEditor } from 'vs/workbench/contrib/notebook/browser/notebookEditor';
import { NotebookEditorInput } from 'vs/workbench/contrib/notebook/common/notebookEditorInput';
import { INotebookService } from 'vs/workbench/contrib/notebook/common/notebookService';
import { NotebookService } from 'vs/workbench/contrib/notebook/browser/notebookServiceImpl';
import { CellKind, CellToolbarLocKey, CellUri, DisplayOrderKey, ExperimentalUseMarkdownRenderer, getCellUndoRedoComparisonKey, IResolvedNotebookEditorModel, NotebookDocumentBackupData, NotebookEditorPriority, NotebookTextDiffEditorPreview, ShowCellStatusBarKey } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { IEditorGroup, IEditorGroupsService } from 'vs/workbench/services/editor/common/editorGroupsService';
import { IEditorService, IOpenEditorOverride } from 'vs/workbench/services/editor/common/editorService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { CustomEditorInfo } from 'vs/workbench/contrib/customEditor/common/customEditor';
import { IN_NOTEBOOK_TEXT_DIFF_EDITOR, NotebookEditorOptions, NOTEBOOK_DIFF_EDITOR_ID, NOTEBOOK_EDITOR_ID, NOTEBOOK_EDITOR_OPEN } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { IUndoRedoService } from 'vs/platform/undoRedo/common/undoRedo';
import { INotebookEditorModelResolverService } from 'vs/workbench/contrib/notebook/common/notebookEditorModelResolverService';
import { ResourceEditorInput } from 'vs/workbench/common/editor/resourceEditorInput';
import { DiffEditorInput } from 'vs/workbench/common/editor/diffEditorInput';
import { NotebookDiffEditorInput } from 'vs/workbench/contrib/notebook/browser/notebookDiffEditorInput';
import { NotebookTextDiffEditor } from 'vs/workbench/contrib/notebook/browser/diff/notebookTextDiffEditor';
import { INotebookEditorWorkerService } from 'vs/workbench/contrib/notebook/common/services/notebookWorkerService';
import { NotebookEditorWorkerServiceImpl } from 'vs/workbench/contrib/notebook/common/services/notebookWorkerServiceImpl';
import { INotebookCellStatusBarService } from 'vs/workbench/contrib/notebook/common/notebookCellStatusBarService';
import { NotebookCellStatusBarService } from 'vs/workbench/contrib/notebook/browser/notebookCellStatusBarServiceImpl';
import { INotebookEditorService } from 'vs/workbench/contrib/notebook/browser/notebookEditorService';
import { NotebookEditorWidgetService } from 'vs/workbench/contrib/notebook/browser/notebookEditorServiceImpl';
import { IJSONContributionRegistry, Extensions as JSONExtensions } from 'vs/platform/jsonschemas/common/jsonContributionRegistry';
import { IJSONSchema } from 'vs/base/common/jsonSchema';
import { Event } from 'vs/base/common/event';
import { IAccessibilityService } from 'vs/platform/accessibility/common/accessibility';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { getFormatedMetadataJSON } from 'vs/workbench/contrib/notebook/browser/diff/diffElementViewModel';
import { NotebookModelResolverServiceImpl } from 'vs/workbench/contrib/notebook/common/notebookEditorModelResolverServiceImpl';
import { INotebookKernelService } from 'vs/workbench/contrib/notebook/common/notebookKernelService';
import { NotebookKernelService } from 'vs/workbench/contrib/notebook/browser/notebookKernelServiceImpl';

// Editor Contribution
import 'vs/workbench/contrib/notebook/browser/contrib/clipboard/notebookClipboard';
import 'vs/workbench/contrib/notebook/browser/contrib/coreActions';
import 'vs/workbench/contrib/notebook/browser/contrib/find/findController';
import 'vs/workbench/contrib/notebook/browser/contrib/fold/folding';
import 'vs/workbench/contrib/notebook/browser/contrib/format/formatting';
import 'vs/workbench/contrib/notebook/browser/contrib/marker/markerProvider';
import 'vs/workbench/contrib/notebook/browser/contrib/outline/notebookOutline';
import 'vs/workbench/contrib/notebook/browser/contrib/status/editorStatus';
import 'vs/workbench/contrib/notebook/browser/contrib/undoRedo/notebookUndoRedo';
import 'vs/workbench/contrib/notebook/browser/contrib/cellOperations/cellOperations';
import 'vs/workbench/contrib/notebook/browser/contrib/viewportCustomMarkdown/viewportCustomMarkdown';
import 'vs/workbench/contrib/notebook/browser/contrib/troubleshoot/layout';


// Diff Editor Contribution
import 'vs/workbench/contrib/notebook/browser/diff/notebookDiffActions';

// Output renderers registration
import 'vs/workbench/contrib/notebook/browser/view/output/transforms/richTransform';

/*--------------------------------------------------------------------------------------------- */

Registry.as<IEditorRegistry>(EditorExtensions.Editors).registerEditor(
	EditorDescriptor.create(
		NotebookEditor,
		NotebookEditor.ID,
		'Notebook Editor'
	),
	[
		new SyncDescriptor(NotebookEditorInput)
	]
);

Registry.as<IEditorRegistry>(EditorExtensions.Editors).registerEditor(
	EditorDescriptor.create(
		NotebookTextDiffEditor,
		NotebookTextDiffEditor.ID,
		'Notebook Diff Editor'
	),
	[
		new SyncDescriptor(NotebookDiffEditorInput)
	]
);

class NotebookDiffEditorSerializer implements IEditorInputSerializer {
	canSerialize(): boolean {
		return true;
	}

	serialize(input: EditorInput): string {
		assertType(input instanceof NotebookDiffEditorInput);
		return JSON.stringify({
			resource: input.resource,
			originalResource: input.originalResource,
			name: input.name,
			originalName: input.originalName,
			textDiffName: input.textDiffName,
			viewType: input.viewType,
		});
	}

	deserialize(instantiationService: IInstantiationService, raw: string) {
		type Data = { resource: URI, originalResource: URI, name: string, originalName: string, viewType: string, textDiffName: string | undefined, group: number };
		const data = <Data>parse(raw);
		if (!data) {
			return undefined;
		}
		const { resource, originalResource, name, originalName, textDiffName, viewType } = data;
		if (!data || !URI.isUri(resource) || !URI.isUri(originalResource) || typeof name !== 'string' || typeof originalName !== 'string' || typeof viewType !== 'string') {
			return undefined;
		}

		const input = NotebookDiffEditorInput.create(instantiationService, resource, name, originalResource, originalName,
			textDiffName || nls.localize('diffLeftRightLabel', "{0} ⟷ {1}", originalResource.toString(true), resource.toString(true)),
			viewType);
		return input;
	}

	static canResolveBackup(editorInput: IEditorInput, backupResource: URI): boolean {
		return false;
	}

}
class NotebookEditorSerializer implements IEditorInputSerializer {
	canSerialize(): boolean {
		return true;
	}
	serialize(input: EditorInput): string {
		assertType(input instanceof NotebookEditorInput);
		return JSON.stringify({
			resource: input.resource,
			name: input.getName(),
			viewType: input.viewType,
		});
	}
	deserialize(instantiationService: IInstantiationService, raw: string) {
		type Data = { resource: URI, viewType: string, group: number };
		const data = <Data>parse(raw);
		if (!data) {
			return undefined;
		}
		const { resource, viewType } = data;
		if (!data || !URI.isUri(resource) || typeof viewType !== 'string') {
			return undefined;
		}

		const input = NotebookEditorInput.create(instantiationService, resource, viewType);
		return input;
	}
}

Registry.as<IEditorInputFactoryRegistry>(EditorInputExtensions.EditorInputFactories).registerEditorInputSerializer(
	NotebookEditorInput.ID,
	NotebookEditorSerializer
);

Registry.as<IEditorInputFactoryRegistry>(EditorInputExtensions.EditorInputFactories).registerCustomEditorInputFactory(
	Schemas.vscodeNotebook,
	new class implements ICustomEditorInputFactory {
		async createCustomEditorInput(resource: URI, instantiationService: IInstantiationService): Promise<NotebookEditorInput> {
			return instantiationService.invokeFunction(async accessor => {
				const backupFileService = accessor.get<IBackupFileService>(IBackupFileService);

				const backup = await backupFileService.resolve<NotebookDocumentBackupData>(resource);
				if (!backup?.meta) {
					throw new Error(`No backup found for Notebook editor: ${resource}`);
				}

				const input = NotebookEditorInput.create(instantiationService, resource, backup.meta.viewType, { startDirty: true });
				return input;
			});
		}

		canResolveBackup(editorInput: IEditorInput, backupResource: URI): boolean {
			if (editorInput instanceof NotebookEditorInput) {
				if (isEqual(URI.from({ scheme: Schemas.vscodeNotebook, path: editorInput.resource.toString() }), backupResource)) {
					return true;
				}
			}

			return false;
		}
	}
);

Registry.as<IEditorInputFactoryRegistry>(EditorInputExtensions.EditorInputFactories).registerEditorInputSerializer(
	NotebookDiffEditorInput.ID,
	NotebookDiffEditorSerializer
);

export class NotebookContribution extends Disposable implements IWorkbenchContribution {
	private _notebookEditorIsOpen: IContextKey<boolean>;
	private _notebookDiffEditorIsOpen: IContextKey<boolean>;

	constructor(
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IEditorService private readonly editorService: IEditorService,
		@INotebookService private readonly notebookService: INotebookService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IAccessibilityService private readonly _accessibilityService: IAccessibilityService,
		@IEditorGroupsService private readonly editorGroupService: IEditorGroupsService,
		@IUndoRedoService undoRedoService: IUndoRedoService,
	) {
		super();

		this._notebookEditorIsOpen = NOTEBOOK_EDITOR_OPEN.bindTo(this.contextKeyService);
		this._notebookDiffEditorIsOpen = IN_NOTEBOOK_TEXT_DIFF_EDITOR.bindTo(this.contextKeyService);

		this._register(undoRedoService.registerUriComparisonKeyComputer(CellUri.scheme, {
			getComparisonKey: (uri: URI): string => {
				return getCellUndoRedoComparisonKey(uri);
			}
		}));

		this._register(this.editorService.overrideOpenEditor({
			getEditorOverrides: (resource: URI, options: IEditorOptions | undefined, group: IEditorGroup | undefined) => {

				const currentEditorsForResource = group && this.editorService.findEditors(resource, group);
				const currentEditorForResource = currentEditorsForResource && currentEditorsForResource.length ? currentEditorsForResource[0] : undefined;

				const associatedEditors = distinct([
					...this.getUserAssociatedNotebookEditors(resource),
					...this.getContributedEditors(resource)
				], editor => editor.id).sort((a, b) => {
					// if a content provider is exclusive, it has higher order
					if (a.exclusive && b.exclusive) {
						return 0;
					}

					if (a.exclusive) {
						return -1;
					}

					if (b.exclusive) {
						return 1;
					}

					return 0;
				});

				return associatedEditors.map(info => {
					return {
						label: info.displayName,
						id: info.id,
						active: currentEditorForResource instanceof NotebookEditorInput && currentEditorForResource.viewType === info.id,
						detail: info.providerDisplayName
					};
				});
			},
			open: (editor, options, group) => {
				return this.onEditorOpening(editor, options, group);
			}
		}));

		this.editorGroupService.whenReady.then(() => this._updateContextKeys());
		this._register(this.editorService.onDidActiveEditorChange(() => this._updateContextKeys()));
		this._register(this.editorService.onDidVisibleEditorsChange(() => this._updateContextKeys()));

		this._register(this.editorGroupService.onDidAddGroup(() => this._updateContextKeys()));
		this._register(this.editorGroupService.onDidRemoveGroup(() => this._updateContextKeys()));
	}

	private _updateContextKeys() {
		this._notebookEditorIsOpen.set(this.editorService.activeEditorPane?.getId() === NOTEBOOK_EDITOR_ID);
		this._notebookDiffEditorIsOpen.set(this.editorService.activeEditorPane?.getId() === NOTEBOOK_DIFF_EDITOR_ID);
	}

	getUserAssociatedEditors(resource: URI) {
		const rawAssociations = this.configurationService.getValue<EditorsAssociations>(editorsAssociationsSettingId) || [];

		return coalesce(rawAssociations
			.filter(association => CustomEditorInfo.selectorMatches(association, resource)));
	}

	getUserAssociatedNotebookEditors(resource: URI) {
		const rawAssociations = this.configurationService.getValue<EditorsAssociations>(editorsAssociationsSettingId) || [];

		return coalesce(rawAssociations
			.filter(association => CustomEditorInfo.selectorMatches(association, resource))
			.map(association => this.notebookService.getContributedNotebookProvider(association.viewType)));
	}

	getContributedEditors(resource: URI) {
		return this.notebookService.getContributedNotebookProviders(resource);
	}

	private onEditorOpening(originalInput: IEditorInput, options: IEditorOptions | ITextEditorOptions | undefined, group: IEditorGroup): IOpenEditorOverride | undefined {

		let id = typeof options?.override === 'string' ? options.override : undefined;
		if (id === undefined && originalInput.resource?.scheme === Schemas.untitled) {
			return undefined;
		}

		if (originalInput instanceof DiffEditorInput && this.configurationService.getValue(NotebookTextDiffEditorPreview) && !this._accessibilityService.isScreenReaderOptimized()) {
			return this._handleDiffEditorInput(originalInput, options, group);
		}

		if (!originalInput.resource) {
			return undefined;
		}

		// Run reopen with ...
		if (id) {
			// from the editor tab context menu
			if (originalInput instanceof NotebookEditorInput) {
				if (originalInput.viewType === id) {
					// reopen with the same type
					return undefined;
				} else {
					return {
						override: (async () => {
							const notebookInput = NotebookEditorInput.create(this.instantiationService, originalInput.resource, id);
							const originalEditorIndex = group.getIndexOfEditor(originalInput);

							await group.closeEditor(originalInput);
							originalInput.dispose();
							const newEditor = await group.openEditor(notebookInput, { ...options, index: originalEditorIndex, override: EditorOverride.DISABLED });
							if (newEditor) {
								return newEditor;
							} else {
								return undefined;
							}
						})()
					};
				}
			} else {
				// from the file explorer
				const existingEditors = this.editorService.findEditors(originalInput.resource, group).filter(editor => editor instanceof NotebookEditorInput) as NotebookEditorInput[];

				if (existingEditors.length) {
					// there are notebook editors with the same resource

					if (existingEditors.find(editor => editor.viewType === id)) {
						return { override: this.editorService.openEditor(existingEditors.find(editor => editor.viewType === id)!, { ...options, override: EditorOverride.DISABLED }, group) };
					} else {
						return {
							override: (async () => {
								const firstEditor = existingEditors[0]!;
								const originalEditorIndex = group.getIndexOfEditor(firstEditor);

								await group.closeEditor(firstEditor);
								firstEditor.dispose();
								const notebookInput = NotebookEditorInput.create(this.instantiationService, originalInput.resource!, id);
								const newEditor = await group.openEditor(notebookInput, { ...options, index: originalEditorIndex, override: EditorOverride.DISABLED });

								if (newEditor) {
									return newEditor;
								} else {
									return undefined;
								}
							})()
						};
					}
				}
			}
		}

		// Click on the editor tab
		if (id === undefined && originalInput instanceof NotebookEditorInput) {
			const existingEditors = this.editorService.findEditors(originalInput.resource, group).filter(editor => editor instanceof NotebookEditorInput && editor === originalInput);

			if (existingEditors.length) {
				// same
				return undefined;
			}
		}

		if (originalInput instanceof NotebookDiffEditorInput) {
			return undefined;
		}

		let notebookUri: URI = originalInput.resource;
		let cellOptions: IResourceEditorInput | undefined;

		const data = CellUri.parse(originalInput.resource);
		if (data) {
			notebookUri = data.notebook;
			cellOptions = { resource: originalInput.resource, options };
		}

		if (id === undefined && originalInput instanceof ResourceEditorInput) {
			const exitingNotebookEditor = <NotebookEditorInput | undefined>group.editors.find(editor => editor instanceof NotebookEditorInput && isEqual(editor.resource, notebookUri));
			id = exitingNotebookEditor?.viewType;
		}

		if (id === undefined) {
			const existingEditors = this.editorService.findEditors(notebookUri, group).filter(editor =>
				!(editor instanceof NotebookEditorInput)
				&& !(editor instanceof NotebookDiffEditorInput)
			);

			if (existingEditors.length) {
				return undefined;
			}

			const userAssociatedEditors = this.getUserAssociatedEditors(notebookUri);
			const notebookEditor = userAssociatedEditors.filter(association => this.notebookService.getContributedNotebookProvider(association.viewType));

			if (userAssociatedEditors.length && !notebookEditor.length) {
				// user pick a non-notebook editor for this resource
				return undefined;
			}

			// user might pick a notebook editor

			const associatedEditors = distinct([
				...this.getUserAssociatedNotebookEditors(notebookUri),
				...(this.getContributedEditors(notebookUri).filter(editor => editor.priority === NotebookEditorPriority.default))
			], editor => editor.id);

			if (!associatedEditors.length) {
				// there is no notebook editor contribution which is enabled by default
				return undefined;
			}
		}

		const infos = this.notebookService.getContributedNotebookProviders(notebookUri);
		let info = infos.find(info => (!id || info.id === id) && info.exclusive) || infos.find(info => !id || info.id === id);

		if (!info && id !== undefined) {
			info = this.notebookService.getContributedNotebookProvider(id);
		}

		if (!info) {
			return undefined;
		}


		/**
		 * Scenario: we are reopening a file editor input which is pinned, we should open in a new editor tab.
		 */
		let index = undefined;
		if (group.activeEditor === originalInput && isEqual(originalInput.resource, notebookUri)) {
			const originalEditorIndex = group.getIndexOfEditor(originalInput);
			index = group.isPinned(originalInput) ? originalEditorIndex + 1 : originalEditorIndex;
		}

		const notebookInput = NotebookEditorInput.create(this.instantiationService, notebookUri, info.id);
		const notebookOptions = new NotebookEditorOptions({ ...options, cellOptions, override: EditorOverride.DISABLED, index });
		return { override: this.editorService.openEditor(notebookInput, notebookOptions, group) };
	}

	private _handleDiffEditorInput(diffEditorInput: DiffEditorInput, options: IEditorOptions | ITextEditorOptions | undefined, group: IEditorGroup): IOpenEditorOverride | undefined {
		const modifiedInput = diffEditorInput.modifiedInput;
		const originalInput = diffEditorInput.originalInput;
		const notebookUri = modifiedInput.resource;
		const originalNotebookUri = originalInput.resource;

		if (!notebookUri || !originalNotebookUri) {
			return undefined;
		}

		const existingEditors = this.editorService.findEditors(notebookUri, group).filter(editor => !(editor instanceof NotebookEditorInput));

		if (existingEditors.length) {
			return undefined;
		}

		const userAssociatedEditors = this.getUserAssociatedEditors(notebookUri);
		const notebookEditor = userAssociatedEditors.filter(association => this.notebookService.getContributedNotebookProvider(association.viewType));

		if (userAssociatedEditors.length && !notebookEditor.length) {
			// user pick a non-notebook editor for this resource
			return undefined;
		}

		// user might pick a notebook editor

		const associatedEditors = distinct([
			...this.getUserAssociatedNotebookEditors(notebookUri),
			...(this.getContributedEditors(notebookUri).filter(editor => editor.priority === NotebookEditorPriority.default))
		], editor => editor.id);

		if (!associatedEditors.length) {
			// there is no notebook editor contribution which is enabled by default
			return undefined;
		}

		const info = associatedEditors[0];

		const notebookInput = NotebookDiffEditorInput.create(this.instantiationService, notebookUri, modifiedInput.getName(), originalNotebookUri, originalInput.getName(), diffEditorInput.getName(), info.id);
		const notebookOptions = new NotebookEditorOptions({ ...options, override: EditorOverride.DISABLED });
		return { override: this.editorService.openEditor(notebookInput, notebookOptions, group) };
	}
}

class CellContentProvider implements ITextModelContentProvider {

	private readonly _registration: IDisposable;

	constructor(
		@ITextModelService textModelService: ITextModelService,
		@IModelService private readonly _modelService: IModelService,
		@IModeService private readonly _modeService: IModeService,
		@INotebookEditorModelResolverService private readonly _notebookModelResolverService: INotebookEditorModelResolverService,
	) {
		this._registration = textModelService.registerTextModelContentProvider(CellUri.scheme, this);
	}

	dispose(): void {
		this._registration.dispose();
	}

	async provideTextContent(resource: URI): Promise<ITextModel | null> {
		const existing = this._modelService.getModel(resource);
		if (existing) {
			return existing;
		}
		const data = CellUri.parse(resource);
		// const data = parseCellUri(resource);
		if (!data) {
			return null;
		}

		const ref = await this._notebookModelResolverService.resolve(data.notebook);
		let result: ITextModel | null = null;

		for (const cell of ref.object.notebook.cells) {
			if (cell.uri.toString() === resource.toString()) {
				const bufferFactory: ITextBufferFactory = {
					create: (defaultEOL) => {
						const newEOL = (defaultEOL === DefaultEndOfLine.CRLF ? '\r\n' : '\n');
						(cell.textBuffer as ITextBuffer).setEOL(newEOL);
						return { textBuffer: cell.textBuffer as ITextBuffer, disposable: Disposable.None };
					},
					getFirstLineText: (limit: number) => {
						return cell.textBuffer.getLineContent(1).substr(0, limit);
					}
				};
				const language = cell.cellKind === CellKind.Markdown ? this._modeService.create('markdown') : (cell.language ? this._modeService.create(cell.language) : this._modeService.createByFilepathOrFirstLine(resource, cell.textBuffer.getLineContent(1)));
				result = this._modelService.createModel(
					bufferFactory,
					language,
					resource
				);
				break;
			}
		}

		if (result) {
			const once = result.onWillDispose(() => {
				once.dispose();
				ref.dispose();
			});
		}

		return result;
	}
}

class CellMetadataContentProvider implements ITextModelContentProvider {
	private readonly _registration: IDisposable;

	constructor(
		@ITextModelService textModelService: ITextModelService,
		@IModelService private readonly _modelService: IModelService,
		@IModeService private readonly _modeService: IModeService,
		@INotebookEditorModelResolverService private readonly _notebookModelResolverService: INotebookEditorModelResolverService,
	) {
		this._registration = textModelService.registerTextModelContentProvider(Schemas.vscodeNotebookCellMetadata, this);
	}

	dispose(): void {
		this._registration.dispose();
	}

	async provideTextContent(resource: URI): Promise<ITextModel | null> {
		const existing = this._modelService.getModel(resource);
		if (existing) {
			return existing;
		}
		const data = CellUri.parseCellMetadataUri(resource);
		// const data = parseCellUri(resource);
		if (!data) {
			return null;
		}

		const ref = await this._notebookModelResolverService.resolve(data.notebook);
		let result: ITextModel | null = null;

		const mode = this._modeService.create('json');

		for (const cell of ref.object.notebook.cells) {
			if (cell.handle === data.handle) {
				const metadataSource = getFormatedMetadataJSON(ref.object.notebook, cell.metadata || {}, cell.language);
				result = this._modelService.createModel(
					metadataSource,
					mode,
					resource
				);
				break;
			}
		}

		if (result) {
			const once = result.onWillDispose(() => {
				once.dispose();
				ref.dispose();
			});
		}

		return result;
	}
}

class RegisterSchemasContribution extends Disposable implements IWorkbenchContribution {
	constructor() {
		super();
		this.registerMetadataSchemas();
	}

	private registerMetadataSchemas(): void {
		const jsonRegistry = Registry.as<IJSONContributionRegistry>(JSONExtensions.JSONContribution);
		const metadataSchema: IJSONSchema = {
			properties: {
				['language']: {
					type: 'string',
					description: 'The language for the cell'
				},
				['editable']: {
					type: 'boolean',
					description: `Controls whether a cell's editor is editable/readonly`
				},
				['breakpointMargin']: {
					type: 'boolean',
					description: 'Controls if the cell has a margin to support the breakpoint UI'
				},
				['hasExecutionOrder']: {
					type: 'boolean',
					description: 'Whether the execution order indicator will be displayed'
				},
				['executionOrder']: {
					type: 'number',
					description: 'The order in which this cell was executed'
				},
				['statusMessage']: {
					type: 'string',
					description: `A status message to be shown in the cell's status bar`
				},
				['runState']: {
					type: 'integer',
					description: `The cell's current run state`
				},
				['runStartTime']: {
					type: 'number',
					description: 'If the cell is running, the time at which the cell started running'
				},
				['lastRunDuration']: {
					type: 'number',
					description: `The total duration of the cell's last run`
				},
				['inputCollapsed']: {
					type: 'boolean',
					description: `Whether a code cell's editor is collapsed`
				},
				['outputCollapsed']: {
					type: 'boolean',
					description: `Whether a code cell's outputs are collapsed`
				}
			},
			// patternProperties: allSettings.patternProperties,
			additionalProperties: true,
			allowTrailingCommas: true,
			allowComments: true
		};

		jsonRegistry.registerSchema('vscode://schemas/notebook/cellmetadata', metadataSchema);
	}
}

// makes sure that every dirty notebook gets an editor
class NotebookFileTracker implements IWorkbenchContribution {

	private readonly _dirtyListener: IDisposable;

	constructor(
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IEditorService private readonly _editorService: IEditorService,
		@INotebookEditorModelResolverService private readonly _notebookEditorModelService: INotebookEditorModelResolverService,
	) {

		type E = IResolvedNotebookEditorModel;
		this._dirtyListener = Event.debounce<E, E[]>(
			this._notebookEditorModelService.onDidChangeDirty,
			(last, current) => !last ? [current] : [...last, current],
			100
		)(this._openMissingDirtyNotebookEditors, this);
	}

	dispose(): void {
		this._dirtyListener.dispose();
	}

	private _openMissingDirtyNotebookEditors(models: IResolvedNotebookEditorModel[]): void {
		const result: IEditorInputWithOptions[] = [];
		for (let model of models) {
			if (model.isDirty() && !this._editorService.isOpen({ resource: model.resource })) {
				result.push({
					editor: NotebookEditorInput.create(this._instantiationService, model.resource, model.viewType),
					options: { inactive: true, preserveFocus: true, pinned: true, }
				});
			}
		}
		if (result.length > 0) {
			this._editorService.openEditors(result);
		}
	}
}

const workbenchContributionsRegistry = Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench);
workbenchContributionsRegistry.registerWorkbenchContribution(NotebookContribution, LifecyclePhase.Starting);
workbenchContributionsRegistry.registerWorkbenchContribution(CellContentProvider, LifecyclePhase.Starting);
workbenchContributionsRegistry.registerWorkbenchContribution(CellMetadataContentProvider, LifecyclePhase.Starting);
workbenchContributionsRegistry.registerWorkbenchContribution(RegisterSchemasContribution, LifecyclePhase.Starting);
workbenchContributionsRegistry.registerWorkbenchContribution(NotebookFileTracker, LifecyclePhase.Ready);

registerSingleton(INotebookService, NotebookService);
registerSingleton(INotebookEditorWorkerService, NotebookEditorWorkerServiceImpl);
registerSingleton(INotebookEditorModelResolverService, NotebookModelResolverServiceImpl, true);
registerSingleton(INotebookCellStatusBarService, NotebookCellStatusBarService, true);
registerSingleton(INotebookEditorService, NotebookEditorWidgetService, true);
registerSingleton(INotebookKernelService, NotebookKernelService, true);

const configurationRegistry = Registry.as<IConfigurationRegistry>(Extensions.Configuration);
configurationRegistry.registerConfiguration({
	id: 'notebook',
	order: 100,
	title: nls.localize('notebookConfigurationTitle', "Notebook"),
	type: 'object',
	properties: {
		[DisplayOrderKey]: {
			description: nls.localize('notebook.displayOrder.description', "Priority list for output mime types"),
			type: ['array'],
			items: {
				type: 'string'
			},
			default: []
		},
		[CellToolbarLocKey]: {
			description: nls.localize('notebook.cellToolbarLocation.description', "Where the cell toolbar should be shown, or whether it should be hidden."),
			type: 'string',
			enum: ['left', 'right', 'hidden'],
			default: 'right'
		},
		[ShowCellStatusBarKey]: {
			description: nls.localize('notebook.showCellStatusbar.description', "Whether the cell status bar should be shown."),
			type: 'boolean',
			default: true
		},
		[NotebookTextDiffEditorPreview]: {
			description: nls.localize('notebook.diff.enablePreview.description', "Whether to use the enhanced text diff editor for notebook."),
			type: 'boolean',
			default: true
		},
		[ExperimentalUseMarkdownRenderer]: {
			description: nls.localize('notebook.experimental.useMarkdownRenderer.description', "Enable/disable using the new extensible markdown renderer."),
			type: 'boolean',
			default: true
		},
	}
});
