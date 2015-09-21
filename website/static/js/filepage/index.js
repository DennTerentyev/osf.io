var $ = require('jquery');
var m = require('mithril');
var mime = require('js/mime');
var bootbox = require('bootbox');
var $osf = require('js/osfHelpers');
var waterbutler = require('js/waterbutler');

// Local requires
var utils = require('./util.js');
var FileEditor = require('./editor.js');
var FileRevisionsTable = require('./revisions.js');
var storageAddons = require('json!storageAddons.json');

// Sanity
var Panel = utils.Panel;


var EDITORS = {'text': FileEditor};


var FileViewPage = {
    controller: function(context) {
        var self = this;
        self.context = context;
        self.file = self.context.file;
        self.node = self.context.node;
        self.editorMeta = self.context.editor;
        self.file.checkout_user = '';
        self.request_done = false;
        self.file.permission = 'read';
        self.isCheckout_user = function() {
            $.ajax({
                method: 'get',
                url: '/api/v1/project/' +self.node.id + '/osfstorage' + self.file.path + '/checkouts/',
            }).done(function(resp) {
                self.request_done = true;
                self.file.checkout_user = resp.checkout_user;
                self.file.permission = resp.permission;
                if ((self.file.checkout_user !== '') && (self.file.checkout_user !== self.context.currentUser.id)) {
                    m.render(document.getElementById('alertBar'), m('.alert.alert-warning[role="alert"]', m.trust('<strong>File is checked-out.</strong> This file has been checked-out by a <a href="/' +
                        self.file.checkout_user +'"> collaborator</a>. It needs to be checked back in before any changes can be made. </div>')));
                }
            }).fail(function(resp) {
            });
        };
        if (self.file.provider === 'osfstorage'){
            self.canEdit = function() {
                return ((self.file.checkout_user === '') || (self.file.checkout_user === self.context.currentUser.id)) ? m.prop(!!self.context.currentUser.canEdit) : false;
            };
            self.isCheckout_user();
        } else {
            self.request_done = true;
            self.canEdit = function() {
                return m.prop(!!self.context.currentUser.canEdit);
            };
        }
        
        $.extend(self.file.urls, {
            delete: waterbutler.buildDeleteUrl(self.file.path, self.file.provider, self.node.id),
            metadata: waterbutler.buildMetadataUrl(self.file.path, self.file.provider, self.node.id),
            revisions: waterbutler.buildRevisionsUrl(self.file.path, self.file.provider, self.node.id),
            content: waterbutler.buildDownloadUrl(self.file.path, self.file.provider, self.node.id, {accept_url: false, mode: 'render'})
        });

        if ($osf.urlParams().branch) {
            self.file.urls.revisions = waterbutler.buildRevisionsUrl(self.file.path, self.file.provider, self.node.id, {sha: $osf.urlParams().branch});
            self.file.urls.content = waterbutler.buildDownloadUrl(self.file.path, self.file.provider, self.node.id, {accept_url: false, mode: 'render', branch: $osf.urlParams().branch});
        }

        $(document).on('fileviewpage:delete', function() {
            bootbox.confirm({
                title: 'Delete file?',
                message: '<p class="overflow">' +
                        'Are you sure you want to delete <strong>' +
                        self.file.safeName + '</strong>?' +
                    '</p>',
                callback: function(confirm) {
                    if (!confirm) {
                        return;
                    }
                    $.ajax({
                        type: 'DELETE',
                        url: self.file.urls.delete,
                        beforeSend: $osf.setXHRAuthorization
                    }).done(function() {
                        window.location = self.node.urls.files;
                    }).fail(function() {
                        $osf.growl('Error', 'Could not delete file.');
                    });
                },
                buttons:{
                    confirm:{
                        label:'Delete',
                        className:'btn-danger'
                    }
                }
            });
        });
        $(document).on('fileviewpage:rent', function() {
            bootbox.confirm({
                title: 'Confirm file check-out?',
                message: 'This would mean ' +
                    'other contributors cannot edit, delete or upload new versions of this file ' +
                    'as long as it is checked-out. You can check it back in at anytime.',
                callback: function(confirm) {
                    if (!confirm) {
                        return;
                    }
                    $osf.postJSON(
                        '/api/v1/project/' + self.node.id + '/osfstorage' + self.file.path +'/checkouts/',
                        {}
                    ).done(function(resp) {
                        window.location.reload();
                    }).fail(function(resp) {
                        $osf.growl('Error', 'Unable to check-out file');
                    });
                },
                buttons:{
                    confirm:{
                        label: 'Check-out file',
                        className: 'btn-warning'
                    }
                }
            });
        });
        $(document).on('fileviewpage:return', function() {
            $.ajax({
                method: 'delete',
                url: '/api/v1/project/' + self.node.id + '/osfstorage' + self.file.path + '/checkouts/',
            }).done(function(resp) {
                window.location.reload();
            }).fail(function(resp) {
                $osf.growl('Error', 'Unable to check-in file');
            });
        });
        $(document).on('fileviewpage:force_return', function() {
            bootbox.confirm({
                title: 'Force check-in file?',
                message: 'This will check-in the file for all users, allowing it to be edited. Are you sure?',
                buttons: {
                    confirm:{
                        label: 'Force check-in',
                        className: 'btn-danger'
                    }
                },
                callback: function(confirm) {
                    if (!confirm) {
                        return;
                    }
                    $.ajax({
                        method: 'delete',
                        url: '/api/v1/project/' + self.node.id + '/osfstorage' + self.file.path +'/checkouts/',
                    }).done(function(resp) {
                        window.location.reload();
                    }).fail(function(resp) {
                        $osf.growl('Error', 'Unable to force check-in file, make sure you have admin privileges.');
                    });
                }

            });
        });
        $(document).on('fileviewpage:download', function() {
            //replace mode=render with action=download for download count incrementation
            window.location = self.file.urls.content.replace('mode=render', 'action=download');
            return false;
        });

        self.shareJSObservables = {
            activeUsers: m.prop([]),
            status: m.prop('connecting'),
            userId: self.context.currentUser.id
        };

        self.editHeader = function() {
            return m('.row', [
                m('.col-sm-12', m('span[style=display:block;]', [
                    m('h3.panel-title',[m('i.fa.fa-pencil-square-o'), '   Edit ']),
                    m('.pull-right', [
                        m('.progress.no-margin.pointer', {
                            'data-toggle': 'modal',
                            'data-target': '#' + self.shareJSObservables.status() + 'Modal'
                        }, [
                            m('.progress-bar.p-h-sm.progress-bar-success', {
                                connected: {
                                    style: 'width: 100%',
                                    class: 'progress-bar progress-bar-success'
                                },
                                connecting: {
                                    style: 'width: 100%',
                                    class: 'progress-bar progress-bar-warning progress-bar-striped active'
                                },
                                saving: {
                                    style: 'width: 100%',
                                    class: 'progress-bar progress-bar-info progress-bar-striped active'
                                }
                            }[self.shareJSObservables.status()] || {
                                    style: 'width: 100%',
                                    class: 'progress-bar progress-bar-danger'
                                }, [
                                    m('span.progress-bar-content', [
                                        {
                                            connected: 'Live editing mode ',
                                            connecting: 'Attempting to connect ',
                                            unsupported: 'Unsupported browser ',
                                            saving: 'Saving... '
                                        }[self.shareJSObservables.status()] || 'Unavailable: Live editing ',
                                        m('i.fa.fa-question-circle.fa-large')
                                    ])
                                ])
                            ])
                        ])
                    ]))
                ]);
        };


        // Hack to delay creation of the editor
        // until we know this is the current file revision
        self.enableEditing = function() {
            // Sometimes we can get here twice, check just in case
            if (self.editor || !self.canEdit()) {
                m.redraw(true);
                return;
            }
            var fileType = mime.lookup(self.file.name.toLowerCase());
            // Only allow files < 1MB to be editable
            if (self.file.size < 1048576 && fileType) { //May return false
                var editor = EDITORS[fileType.split('/')[0]];
                if (editor) {
                    self.editor = new Panel('Edit', self.editHeader, editor, [self.file.urls.content, self.file.urls.sharejs, self.editorMeta, self.shareJSObservables], false);
                }
            }
            m.redraw(true);
        };

        //Hack to polyfill the Panel interface
        //Ran into problems with mithrils caching messing up with multiple "Panels"
        self.revisions = m.component(FileRevisionsTable, self.file, self.node, self.enableEditing, self.canEdit);
        self.revisions.selected = false;
        self.revisions.title = 'Revisions';

        // inform the mfr of a change in display size performed via javascript,
        // otherwise the mfr iframe will not update unless the document windows is changed.
        self.triggerResize = $osf.throttle(function () {
            $(document).trigger('fileviewpage:resize');
        }, 1000);

        self.mfrIframeParent = $('#mfrIframeParent');
    },
    view: function(ctrl) {
        //This code was abstracted into a panel toggler at one point
        //it was removed and shoved here due to issues with mithrils caching and interacting
        //With other non-mithril components on the page
        var panelsShown = (
            ((ctrl.editor && ctrl.editor.selected) ? 1 : 0) + // Editor panel is active
            (ctrl.mfrIframeParent.is(':visible') ? 1 : 0)    // View panel is active
        );
        var mfrIframeParentLayout;
        var fileViewPanelsLayout;

        if (panelsShown === 2) {
            // view | edit
            mfrIframeParentLayout = 'col-sm-6';
            fileViewPanelsLayout = 'col-sm-6';
        } else {
            // view
            if (ctrl.mfrIframeParent.is(':visible')) {
                mfrIframeParentLayout = 'col-sm-12';
                fileViewPanelsLayout = '';
            } else {
                // edit or revisions
                mfrIframeParentLayout = '';
                fileViewPanelsLayout = 'col-sm-12';
            }
        }
        $('#mfrIframeParent').removeClass().addClass(mfrIframeParentLayout);
        $('.file-view-panels').removeClass().addClass('file-view-panels').addClass(fileViewPanelsLayout);

        if(ctrl.file.urls.external && !ctrl.file.privateRepo) {
            m.render(document.getElementById('externalView'), [
                m('p.text-muted', 'View this file on ', [
                    m('a', {href:ctrl.file.urls.external}, storageAddons[ctrl.file.provider].fullName)
                ], '.')
            ]);
        }

        var editButton = function() {
            if (ctrl.editor) {
                return m('button.btn' + (ctrl.editor.selected ? '.btn-primary' : '.btn-default'), {
                    onclick: function (e) {
                        e.preventDefault();
                        // atleast one button must remain enabled.
                        if ((!ctrl.editor.selected || panelsShown > 1)) {
                            ctrl.editor.selected = !ctrl.editor.selected;
                            ctrl.revisions.selected = false;
                        }
                    }
                }, ctrl.editor.title);
            }
        };

        m.render(document.getElementById('toggleBar'), m('.btn-toolbar.m-t-md', [
            ctrl.canEdit() && (ctrl.file.checkout_user === '') && ctrl.request_done ? m('.btn-group.m-l-xs.m-t-xs', [
                m('button.btn.btn-sm.btn-danger.file-delete', {onclick: $(document).trigger.bind($(document), 'fileviewpage:delete')}, 'Delete')
            ]) : '',
            ctrl.context.currentUser.canEdit && (!ctrl.canEdit()) && ctrl.request_done && (ctrl.file.permission === 'admin') ? m('.btn-group.m-l-xs.m-t-xs', [
                m('.btn.btn-sm.btn-danger', {onclick: $(document).trigger.bind($(document), 'fileviewpage:force_return')}, 'Force Check-in')
            ]) : '',
            ctrl.canEdit() && (ctrl.file.checkout_user === '') && ctrl.request_done && (ctrl.file.provider === 'osfstorage') ? m('.btn-group.m-l-xs.m-t-xs', [
                m('.btn.btn-sm.btn-warning', {onclick: $(document).trigger.bind($(document), 'fileviewpage:rent')}, 'Check-out')
            ]) : '',
            (ctrl.canEdit() && (ctrl.file.checkout_user === ctrl.context.currentUser.id) && ctrl.request_done) ? m('.btn-group.m-l-xs.m-t-xs', [
                m('.btn.btn-sm.btn-warning', {onclick: $(document).trigger.bind($(document), 'fileviewpage:return')}, 'Check-in')
            ]) : '',
            m('.btn-group.m-t-xs', [
                m('button.btn.btn-sm.btn-primary.file-download', {onclick: $(document).trigger.bind($(document), 'fileviewpage:download')}, 'Download')
            ]),
            m('.btn-group.btn-group-sm.m-t-xs', [
               ctrl.editor ? m( '.btn.btn-default.disabled', 'Toggle view: ') : null
            ].concat(
                m('button.btn' + (ctrl.mfrIframeParent.is(':visible') ? '.btn-primary' : '.btn-default'), {
                    onclick: function (e) {
                        e.preventDefault();
                        // at least one button must remain enabled.
                        if (!ctrl.mfrIframeParent.is(':visible') || panelsShown > 1) {
                            ctrl.mfrIframeParent.toggle();
                            ctrl.revisions.selected = false;
                        } else if (ctrl.mfrIframeParent.is(':visible') && !ctrl.editor){
                            ctrl.mfrIframeParent.toggle();
                            ctrl.revisions.selected = true;
                        }
                    }
                }, 'View'), editButton())
            ),
            m('.btn-group.m-t-xs', [
                m('button.btn.btn-sm' + (ctrl.revisions.selected ? '.btn-primary': '.btn-default'), {onclick: function(){
                    var editable = ctrl.editor && ctrl.editor.selected;
                    var viewable = ctrl.mfrIframeParent.is(':visible');
                    if (editable || viewable){
                        if (viewable){
                            ctrl.mfrIframeParent.toggle();
                        }
                        if (editable) {
                            ctrl.editor.selected = false;
                        }
                        ctrl.revisions.selected = true;
                    } else {
                        ctrl.mfrIframeParent.toggle();
                        if (ctrl.editor) {
                            ctrl.editor.selected = false;
                        }
                        ctrl.revisions.selected = false;
                    }
                }}, 'Revisions')
            ])
        ]));

        if (ctrl.revisions.selected){
            return m('.file-view-page', m('.panel-toggler', [
                m('.row', ctrl.revisions)
            ]));
        }
        var editDisplay = (ctrl.editor && !ctrl.editor.selected) ? 'display:none' : '' ;
        ctrl.triggerResize();
        return m('.file-view-page', m('.panel-toggler', [
            m('.row[style="' + editDisplay + '"]', m('.col-sm-12', ctrl.editor),
             m('.row[style="display:none"]', ctrl.revisions))
        ]));
    }
};

module.exports = function(context) {
    // Treebeard forces all mithril to load twice, to avoid
    // destroying the page iframe this out side of mithril.
    if (!context.file.urls.render) {
        $('#mfrIframe').html(context.file.error);
    } else {
        var url = context.file.urls.render;
        if (navigator.appVersion.indexOf('MSIE 9.') !== -1) {
            url += url.indexOf('?') > -1 ? '&' : '?';
            url += 'cookie=' + (document.cookie.match(window.contextVars.cookieName + '=(.+?);|$')[1] || '');
        }

        if (window.mfr !== undefined) {
            var mfrRender = new mfr.Render('mfrIframe', url, {}, 'cos_logo.png');
            $(document).on('fileviewpage:reload', function() {
                mfrRender.reload();
            });
            $(document).on('fileviewpage:resize', function() {
                mfrRender.resize();
            });
        }

    }

    return m.component(FileViewPage, context);
};
