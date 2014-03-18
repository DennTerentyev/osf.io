import os

from framework import fields
from website.addons.base import AddonUserSettingsBase, AddonNodeSettingsBase, GuidFile


class DropboxGuidFile(GuidFile):

    path = fields.StringField(index=True)

    @property
    def file_url(self):
        if self.path is None:
            raise ValueError('Path field must be defined.')
        return os.path.join('dropbox', self.path)


class DropboxUserSettings(AddonUserSettingsBase):

    dropbox_id = fields.StringField()
    access_token = fields.StringField()

    def to_json(self, user):
        output = super(DropboxUserSettings, self).to_json(user)
        output['has_auth'] = self.has_auth
        return output

    @property
    def has_auth(self):
        return bool(self.access_token)

    def clear_auth(self):
        self.dropbox_id = None
        self.access_token = None
        return self

    def delete(self):
        super(DropboxUserSettings, self).delete()
        self.clear_auth()
        for node_settings in self.dropboxnodesettings__authorized:
            node_settings.delete(save=False)
            node_settings.user_settings = None
            node_settings.save()

class DropboxNodeSettings(AddonNodeSettingsBase):

    user_settings = fields.ForeignField(
        'dropboxusersettings', backref='authorized'
    )

    def delete(self, save=True):
        super(DropboxNodeSettings, self).delete(save=False)
        if save:
            self.save()

    def to_json(self, user):
        rv = super(DropboxNodeSettings, self).to_json(user)
        return rv

    @property
    def is_registration(self):
        pass

    @property
    def has_auth(self):
        pass
