var GmailToTrello = GmailToTrello || {};

GmailToTrello.Model = function(parent) {
    this.trello = {
        apiKey: 'c50413b23ee49ca49a5c75ccf32d0459',
        user: null,
        boards: null
    };
    this.parent = parent;
    this.settings = {};
    this.isPopupDataLoaded = false;
    this.isThreadCardsLoaded = false;
    this.isAuthorized = false;
    this.event = new EventTarget();
    this.newCard = null;
};

GmailToTrello.Model.prototype.init = function() {
    gtt_log("init Trello");

    this.isAuthorized = true;

    var self = this;

    this.trello.user = null;
    this.trello.boards = null;

    Trello.setKey(this.trello.apiKey);
    Trello.authorize({
        interactive: false,
        success: function() {
            self.event.fire('onAuthorized');
        }
    });

    if (!Trello.authorized()) {
        this.event.fire('onBeforeAuthorize');

        Trello.authorize({
            type: 'popup',
            name: "Gmail-to-Trello",
            persit: true,
            scope: {read: true, write: true},
            expiration: 'never',
            success: function(data) {
                gtt_log('initTrello: Trello authorization successful');
                // gtt_log(data);
                self.event.fire('onAuthorized');
            },
            error: function() {
                self.event.fire('onAuthenticateFailed');
            }
        });

    }
    else {
        //gtt_log(Trello);
        //gtt_log(Trello.token());
    }
};

GmailToTrello.Model.prototype.deauthorizeTrello = function() {
    gtt_log("deauthorizeTrello");

    Trello.deauthorize();
    this.isPopupDataLoaded = false;
    this.isThreadCardsLoaded = false;
    this.isAuthorized = false;
};

GmailToTrello.Model.prototype.makeAvatarUrl = function(avatarHash) {
    var retn = '';
    if (avatarHash && avatarHash.length > 0) {
        retn = 'https://trello-avatars.s3.amazonaws.com/' + avatarHash + '/30.png';
    }
    return retn;
}

GmailToTrello.Model.prototype.loadPopupData = function() {
    gtt_log('loadPopupData');

    this.isPopupDataLoaded = true;

    var self = this;

    self.event.fire('onBeforeLoadPopup');

    self.trello.user = null;
    self.trello.boards = null;

    // get user's info
    gtt_log('loadPopupData: User info');
    Trello.get('members/me', {}, function(data) {
        if (!data || !data.hasOwnProperty('id')) {
            return false;
        }
        self.trello.user = data;
        self.checkPopupDataReady();
    }, function failure(data) {
        self.event.fire('onAPIFailure', {data:data});
    });

    // get user's boards
    gtt_log('loadPopupData: User boards');
    Trello.get('members/me/boards', {
            'organization': 'true',
            'organization_fields': 'displayName',
            'filter': 'open',
            'fields': 'name' /* "name,closed" */
        }, function(data) {
            var validData = Array();
            for (var i = 0; i < data.length; i++) {
                // if (data[i].idOrganization === null)
                //   data[i].idOrganization = '-1';

                // Only accept opening boards
                if (i==0) {
                    // gtt_log(JSON.stringify(data[i]));
                }
                if (data[i].closed != true) {
                    validData.push(data[i]);
                }
            }
            // gtt_log('loadPopupData: Boards data');
            // gtt_log(JSON.stringify(data));
            // gtt_log(JSON.stringify(validData));
            self.trello.boards = validData;
            self.checkPopupDataReady();
        }, function failure(data) {
            self.event.fire('onAPIFailure', {data:data});
        }
    );

};

GmailToTrello.Model.prototype.checkPopupDataReady = function() {
    if (this.trello.user !== null && this.trello.boards !== null) {
        // yeah! the data is ready
        //gtt_log('checkPopupDataReady: YES');
        //gtt_log(this);
        this.event.fire('onPopupDataReady');

    }
    //else gtt_log('checkPopupDataReady: NO');
};


GmailToTrello.Model.prototype.loadTrelloLists = function(boardId) {
    gtt_log('loadTrelloLists');

    var self = this;
    this.trello.lists = null;

    Trello.get('boards/' + boardId, {lists: "open", list_fields: "name"}, function(data) {
        self.trello.lists = data.lists;
        gtt_log('loadTrelloLists: lists:' + JSON.stringify(self.trello.lists));
        self.event.fire('onLoadTrelloListSuccess');
    }, function failure(data) {
            self.event.fire('onAPIFailure', {data:data});
    });
};

GmailToTrello.Model.prototype.loadTrelloCards = function(listId) {
    gtt_log('loadTrelloCards');

    var self = this;
    this.trello.cards = null;

    Trello.get('lists/' + listId + '/cards', {fields: "name,pos,idMembers,idLabels"}, function(data) {
        self.trello.cards = data;
        gtt_log('loadTrelloCards: cards:' + JSON.stringify(self.trello.cards));
        self.event.fire('onLoadTrelloCardsSuccess');
    }, function failure(data) {
            self.event.fire('onAPIFailure', {data:data});
    });
};

GmailToTrello.Model.prototype.loadTrelloLabels = function(boardId) {
    gtt_log('loadTrelloLabels');

    var self = this;
    this.trello.labels = null;

    Trello.get('boards/' + boardId + '/labels', {fields: "color,name"}, function(data) {
        self.trello.labels = data;
        gtt_log('loadTrelloLabels: labels:' + JSON.stringify(self.trello.labels));
        self.event.fire('onLoadTrelloLabelsSuccess');
    }, function failure(data) {
        self.event.fire('onAPIFailure', {data:data});
    });
};

GmailToTrello.Model.prototype.loadTrelloMembers = function(boardId) {
    gtt_log('loadTrelloMembers');

    var self = this;
    this.trello.members = null;

    Trello.get('boards/' + boardId + '/members', {fields: "fullName,username,initials,avatarHash"}, function(data) {
        var me = self.trello.user;
        // Remove this user from the members list:
        self.trello.members = $.map(data, function (item, iter) {
            return (item.id !== me.id ? item : null);
        });
        // And shove this user in the first position:
        self.trello.members.unshift({
            'id': me.id,
            'username': me.username,
            'initials': me.initials,
            'avatarHash': me.avatarHash,
            'fullName': me.fullName
        });

        gtt_log('loadTrelloMembers: members:' + JSON.stringify(self.trello.members));

        self.event.fire('onLoadTrelloMembersSuccess');
    }, function failure(data) {
        self.event.fire('onAPIFailure', {data:data});
    });
};

GmailToTrello.Model.prototype.loadThreadTrelloCards = function () {
    var self = this;

    self.isThreadCardsLoaded = true;

    // get cards associated with the thread on the current thread
    // i would love to do this with the message ids, but there's no way to get all of them to search
    // so let's use the subject and time method
    if (!self.gmail || !self.gmail.subject || self.gmail.subject.length < 1) {
        gtt_log('loadThreadTrelloCards: Current page is not a thread');
        self.trello.threadCards = [];
        self.event.fire('onLoadThreadTrelloCardsSuccess');
    }
    else {
        gtt_log('loadThreadTrelloCards: Cards for current thread');
        var query = encodeURIComponent(self.gmail.subject);
        Trello.get('search', {'query': query, 'modelTypes': 'cards'}, function(data) {

            if (!data || !data.hasOwnProperty('cards')) {
                data = {'cards': []}
            }

            // need to make sure the time matches
            // because i may not be in the same time zone as when it was set, give a 24-hour window on either side
            var cards = [];
            data['cards'].forEach(function (card) {
                var addCard = false;
                var matches = card.desc.match(/&within=1d&date=(\S+)/g);
                if (matches) {
                  matches.forEach(function (str) {
                      var cardTime = Date.parse(decodeURIComponent(str.substring(16)).replace(' at ', ' ')).getTime();
                      self.gmail.messageTimes.forEach(function (messageTime) {
                          var diff = cardTime - messageTime;
                          if (diff < 86400000 && diff > -86400000) {
                              addCard = true;
                          }
                      });
                  });
                }
                if (addCard) {
                    cards.push(card);
                }
            });

            self.trello.threadCards = cards;
            self.sortThreadCards();
            self.event.fire('onLoadThreadTrelloCardsSuccess');

        }, function failure(data) {
            self.event.fire('onAPIFailure', {data:data});
        });
    }

};

GmailToTrello.Model.prototype.sortThreadCards = function () {

    var self = this;
    self.trello.threadCards.sort(function (a,b) {
        if (!a.closed && b.closed) { return -1; }
        if (a.closed && !b.closed) { return 1; }
        if (!a.dueComplete && b.dueComplete) { return -1; }
        if (a.dueComplete && !b.dueComplete) { return 1; }
        if (a.due && !b.due) { return -1; }
        if (b.due && !a.due) { return 1; }
        if (a.due && b.due) {
            return new Date(a.due.replace('T',' ')).getTime() - new Date(b.due.replace('T',' ')).getTime();
        }
        return 0;
    });

}

GmailToTrello.Model.prototype.Uploader = function(args) {
    if (!args || !args.hasOwnProperty('parent')) {
        return;
    }
    this.parent = args.parent;

    this.data = [];
    
    this.cardId = args.cardId || '';

    this.pos = this.translatePosition({'position': args.position || '', 'cardPos': args.cardPos || ''});

    if (this.pos !== 'at') {
        this.data.push({'property': 'cards'}); // Seed array for new card
    } 
};

GmailToTrello.Model.prototype.Uploader.prototype = {
    'attachments': 'attachments',

    'exclude': function(list, exclude) {
        let list_new = [];
        $.each(list.split(','), function(iter, item) {
            if (exclude.indexOf(item) === -1) {
                list_new.push(item);
            }
        });
        return list_new.join(',');
    },
    
    'add': function(args) {
        if (this.parent.parent.validHash(args)) {
            if (this.pos !== 'at' && args.property !== this.attachments) { // It's a new card so add to the existing hash:
                this.data[0][args.property] = args.value;
            } else {
                const cardId_k = (this.pos === 'at' ? this.cardId : '%cardId%'); // Won't know until we store the initial card
                args.property = 'cards/' + cardId_k + '/' + args.property;
                this.data.push(args);
            }
        }
        return this;
    },

    'translatePosition': function(args) {
        let pos = 'bottom';
        
        const position_k = args.position || 'below';
        const cardPos_k = parseInt(args.cardPos || 0, 10);

        switch (position_k) {
            case 'below':
                if (cardPos_k) {
                    pos = cardPos_k + 1;
                } else {
                    // pos = 'bottom';
                }
                break;
            case 'to':
                if (!this.cardId || this.cardId.length < 1 || this.cardId === '-1') {
                    pos = 'top';
                } else {
                    pos = 'at';
                }
                break;
        default:
            gtt_log('submit: ERROR: Got unknown case: ' + position_k || '<empty position>');
        }

        return pos;
    },
    
    'process_response': function(data_in) {
        const dl_k = this.parent.parent.deep_link; // Pointer to function for expedience

        const url_k = dl_k(data_in, ['url']);
        const id_k = dl_k(data_in, ['id']);
        const card_k = dl_k(data_in, ['data', 'card']);

        let shortLink = dl_k(card_k, ['shortLink']);
        if (shortLink && shortLink.length > 0) {
            shortLink = 'https://trello.com/c/' + shortLink;
        }
        
        const add_id_k = dl_k(card_k, ['id']);
        const add_title_k = dl_k(card_k, ['name']);

        const new_url_k = shortLink || url_k || '';
        const new_id_k = add_id_k || id_k || '';

        if (new_url_k && this.parent.newCard && !this.parent.newCard.url) {
            this.parent.newCard.url = new_url_k;
        }
        if (new_id_k && this.parent.newCard && !this.parent.newCard.id) {
            this.parent.newCard.id = new_id_k;
            this.cardId = new_id_k;
        }
        if (add_title_k && add_title_k.length > 0) {
            this.parent.newCard.title = add_title_k;
        }
    },

    'attach': function(method, property, upload1, success, error) {
        if (!property || property.length < 6 || !upload1 || !upload1.value || upload1.value.length < 6) return;
        
        const trello_url_k = 'https://api.trello.com/1/';
        const param_k = upload1.value;

        var xhr = new XMLHttpRequest();
        xhr.open('get', param_k);
        xhr.responseType = 'blob'; // Use blob to get the mimetype
        xhr.onload = function() {
            var fileReader = new FileReader();
            fileReader.onload = function() {
                const filename_k = (param_k.split('/').pop().split('#')[0].split('?')[0]) || upload1.name || param_k || 'unknown_filename'; // Removes # or ? after filename
                const file_k = new File([this.result], filename_k);
                var form = new FormData();
                form.append('file', file_k);
                form.append('key', Trello.key())
                form.append('token', Trello.token());

                const opts_k = {
                    'url': trello_url_k + property,
                    'method': 'POST',
                    'data': form,
                    'dataType': 'json',
                    'success': success,
                    'error': error,
                    'cache': false,
                    'contentType': false,
                    'processData': false
                };
                return $.ajax(opts_k);
            };
            fileReader.readAsArrayBuffer(xhr.response); // Use filereader on blob to get content
        };
        xhr.send();
    },

    'upload': function() {
        let upload1 = this.data.shift();
        if (!upload1) {
            this.event.fire('onCardSubmitComplete');
        } else {
            let generateKeysAndValues = function(object) {
                let keysAndValues = [];
                $.each(object, function(key, value) {
                    keysAndValues.push(key + ' (' + (value || '').toString().length + ')');
                });
                return keysAndValues.sort().join(' ');
            };

            const dict_k = {'cardId': this.cardId || ''};

            let method = upload1.method || 'post';
            let property = this.parent.parent.replacer(upload1.property, dict_k);
            delete upload1.method;
            delete upload1.property;

            const fn_k = property.endsWith(this.attachments) ? this.attach : Trello.rest;

            let self = this;
            fn_k(method, property, upload1, function success(data) {
                if (data.idBoard) {
                  self.parent.trello.threadCards.push(data); // if it's a card, add to the list
                  self.parent.sortThreadCards();
                }
                $.extend(data, {'method': method + ' ' + property, 'keys': generateKeysAndValues(upload1)});
                self.process_response(data);
                if (self.data && self.data.length > 0) {
                    self.upload();
                } else {
                    self.parent.event.fire('onCardSubmitComplete', {data: data});
                }
            }, function failure(data) {
                $.extend(data, {'method': method + ' ' + property, 'keys': generateKeysAndValues(upload1)});
                self.parent.event.fire('onAPIFailure', {data: data});
            });
        }
    }

};

GmailToTrello.Model.prototype.submit = function() {
    let self = this;
    if (this.newCard === null) {
        gtt_log('submit: data is empty');
        return false;
    }

    this.parent.saveSettings();

    var data = this.newCard;
    
    var text = data.title || '';
    if (text.length > 0) {
        if (data.markdown) {
            text = '**' + text + '**\n\n';
        }
    }
    text += data.description;

    text = this.parent.truncate(text, this.parent.popupView.MAX_BODY_SIZE, '...');

    var desc = this.parent.truncate(data.description, this.parent.popupView.MAX_BODY_SIZE, '...');

    var due_text = '';

    if (data.due_Date && data.due_Date.length > 1) { // Will 400 if not valid date:
        /* Workaround for quirk in Date object,
         * See: http://stackoverflow.com/questions/28234572/html5-datetime-local-chrome-how-to-input-datetime-in-current-time-zone
         * Was: dueDate.replace('T', ' ').replace('-','/')
         */
        let due = data.due_Date.replace('-', '/');

        if (data.due_Time && data.due_Time.length > 1) {
            due += ' ' + data.due_Time;
        } else {
            due += ' 00:00'; // Must provide time
        }
        due_text = (new Date(due)).toISOString();
        /* (NOTE (Ace, 27-Feb-2017): When we used datetime-local object, this was:
        trelloPostableData.due = (new Date(data.dueDate.replace('T', ' ').replace('-','/'))).toISOString();
        */
    }

    let uploader = new this.Uploader({
        'parent': self, 
        'cardId': data.cardId,
        'position': data.position,
        'cardPos': data.cardPos
    });

    const pos_k = uploader.pos;

    if (pos_k === 'at') {
        uploader.add({'property': 'actions/comments', 'text': text});
    } else {
        uploader
            .add({'property': 'pos', 'value': pos_k})
            .add({'property': 'name', 'value': data.title})
            .add({'property': 'desc', 'value': desc})
            .add({'property': 'idList', 'value': data.listId});
    }

    uploader
        .add({'property': 'idMembers', 'value': uploader.exclude(data.membersId, data.cardMembers)})
        .add({'property': 'idLabels', 'value': uploader.exclude(data.labelsId, data.cardLabels)})
        .add({'property': 'due', 'value': due_text, 'method': 'put'})

    let imagesAndAttachments = (data.images || []).concat(data.attachments || []);

    $.each(imagesAndAttachments, function(iter, item) {
        if (item.hasOwnProperty('checked') && item.checked && item.url && item.url.length > 5) {
            uploader.add({'property': uploader.attachments, 'value': item.url, 'name': item.name});
        }
    });

  uploader.upload();
};

// End, model.js